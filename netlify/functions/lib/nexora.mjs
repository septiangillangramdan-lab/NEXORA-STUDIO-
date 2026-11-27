// NEXORA STUDIO v2.0.0 — pustaka bersama untuk collab.mjs, agent-run.mjs, agent-run-background.mjs
import { timingSafeEqual } from 'node:crypto';

export const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});

export function authorized(value) {
  const expected = process.env.NEXORA_CLOUD_ACCESS_CODE || '';
  const a = Buffer.from(String(value || '')), b = Buffer.from(expected);
  return !!expected && a.length === b.length && timingSafeEqual(a, b);
}

export const clean = (v, max = 5000) => String(v ?? '').trim().slice(0, max);
export const intEnv = (name, fallback, min = 0, max = 100000) => {
  const n = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

// ---------- Supabase REST ----------
function config() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY harus diatur di Netlify.');
  return { url, key };
}

export async function sb(path, { method = 'GET', body, headers = {} } = {}) {
  const { url, key } = config();
  const res = await fetch(`${url}${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.message || data?.error || `Supabase error ${res.status}`);
    err.code = data?.code; err.status = res.status;
    throw err;
  }
  return data;
}

export async function sbCount(path) {
  const { url, key } = config();
  const res = await fetch(`${url}${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact', Range: '0-0' } });
  if (!res.ok) throw new Error(`Supabase count error ${res.status}`);
  const m = /\/(\d+)$/.exec(res.headers.get('content-range') || '');
  return m ? parseInt(m[1], 10) : 0;
}

const enc = encodeURIComponent;
const REP = { Prefer: 'return=representation' };
const nowIso = () => new Date().toISOString();
export const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
export const need = (id, label = 'ID') => { if (!isUuid(id)) throw httpError(400, `${label} tidak valid.`); return id; };
export function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

// ---------- Tim & template pipeline ----------
export const AGENTS = {
  Septian: 'CEO', Arka: 'Director', Nara: 'Research', Saka: 'Fact Checker', Raka: 'Story',
  Kirana: 'Scriptwriter', Aira: 'Artist', Kairo: 'Animator', Viona: 'Voice', Damar: 'Video Editor', Elara: 'Quality Control'
};
export const AGENT_NAMES = Object.keys(AGENTS);

// deps = step yang harus selesai dulu; reads = tambahan konteks (selain deps) yang dibaca Agent.
export const PIPELINE = [
  { key: 'plan', agent: 'Arka', title: 'Rencana produksi', deps: [], reads: [],
    ask: 'Susun rencana produksi singkat: tujuan video, target penonton, gaya visual, durasi perkiraan, struktur adegan garis besar, risiko, dan pembagian tugas untuk Nara, Saka, Raka, Kirana, Aira, Kairo, Viona, Damar, Elara.' },
  { key: 'research', agent: 'Nara', title: 'Riset ide & referensi', deps: ['plan'], reads: [],
    ask: 'Kumpulkan bahan riset: latar topik, sudut pandang menarik, fakta kunci yang perlu dipakai, dan pertanyaan terbuka. Kamu TIDAK punya akses internet langsung; tulis dari pengetahuan model dan tandai bagian yang perlu dicek sumbernya.' },
  { key: 'factcheck', agent: 'Saka', title: 'Pemeriksaan fakta', deps: ['research'], reads: ['plan'],
    ask: 'Periksa klaim dalam riset. Kamu TIDAK punya akses internet dan tidak boleh mengaku sudah memverifikasi sumber. Beri tabel singkat: klaim | penilaian (Konsisten / Perlu verifikasi / Berisiko) | sumber yang sebaiknya dicek manusia.' },
  { key: 'story', agent: 'Raka', title: 'Konsep & alur cerita', deps: ['research', 'factcheck'], reads: ['plan'],
    ask: 'Kembangkan konsep dan alur cerita orisinal (hook, konflik, klimaks, penutup) berdasarkan riset dan catatan fakta. Hindari klaim yang ditandai berisiko.' },
  { key: 'script', agent: 'Kirana', title: 'Naskah & dialog', deps: ['story'], reads: ['plan', 'factcheck'], approval: true,
    ask: 'Tulis naskah lengkap: narasi, dialog, dan pembagian adegan bernomor beserta perkiraan durasi.' },
  { key: 'visual', agent: 'Aira', title: 'Desain visual & aset', deps: ['script'], reads: ['plan'],
    ask: 'Buat panduan visual: desain karakter, latar, palet warna, dan prompt gambar per adegan. Hasilmu berupa dokumen teks/prompt, BUKAN file gambar.' },
  { key: 'voice', agent: 'Viona', title: 'Arahan suara & audio', deps: ['script'], reads: ['plan'],
    ask: 'Buat arahan voice-over: gaya suara, tempo, emosi per adegan, dan saran musik/efek suara. Hasilmu berupa dokumen arahan, BUKAN file audio.' },
  { key: 'animation', agent: 'Kairo', title: 'Rencana animasi', deps: ['visual'], reads: ['script'],
    ask: 'Buat rencana animasi per adegan: gerakan kamera, gerakan karakter, transisi, dan durasi. Hasilmu berupa shot list teks, BUKAN video.' },
  { key: 'edit', agent: 'Damar', title: 'Rencana penyuntingan', deps: ['animation', 'voice'], reads: ['script'],
    ask: 'Susun edit decision list: urutan klip, timing narasi, teks di layar, musik, dan spesifikasi ekspor. Hasilmu berupa dokumen, BUKAN video jadi.' },
  { key: 'qc', agent: 'Elara', title: 'Quality Control', deps: ['edit'], reads: ['script', 'visual', 'voice', 'animation'], approval: true,
    ask: 'Periksa seluruh paket kerja: konsistensi naskah-visual-suara-animasi, kualitas, dan risiko fakta. Akhiri jawaban dengan SATU baris persis: "VERDICT: PASS" jika layak, atau "VERDICT: REVISE <NamaAgent>: <alasan singkat>" jika satu tahap harus diperbaiki (NamaAgent salah satu dari Raka, Kirana, Aira, Kairo, Viona, Damar).' }
];
export const REVISABLE = new Set(['Raka', 'Kirana', 'Aira', 'Kairo', 'Viona', 'Damar']);
export const MAX_REVISIONS = 2;

// ---------- State machine task ----------
const T = {
  queued: ['working', 'blocked'],
  blocked: ['queued'],
  working: ['completed', 'awaiting_approval', 'failed', 'queued', 'blocked'],
  awaiting_approval: ['completed', 'revision', 'blocked'],
  revision: ['working', 'blocked'],
  completed: ['revision', 'blocked'],
  failed: ['queued', 'blocked'],
  review: ['completed', 'revision'],
  approved: ['completed', 'revision']
};
export const canTransition = (from, to) => !!T[from]?.includes(to);

export function downstreamOf(taskId, deps) {
  const children = new Map();
  for (const d of deps) { if (!children.has(d.depends_on)) children.set(d.depends_on, []); children.get(d.depends_on).push(d.task_id); }
  const seen = new Set(), stack = [taskId];
  while (stack.length) for (const c of children.get(stack.pop()) || []) if (!seen.has(c)) { seen.add(c); stack.push(c); }
  return seen;
}

export function parseVerdict(text) {
  const lines = String(text || '').split('\n').map(s => s.trim()).filter(Boolean).reverse();
  for (const line of lines) {
    const m = /^\**\s*VERDICT\s*:\s*(PASS|REVISE)\b\s*(?:([A-Za-z]+)\s*:?\s*(.*))?$/i.exec(line.replace(/\*+/g, ''));
    if (!m) continue;
    if (m[1].toUpperCase() === 'PASS') return { verdict: 'PASS' };
    const target = AGENT_NAMES.find(n => n.toLowerCase() === String(m[2] || '').toLowerCase());
    return { verdict: 'REVISE', target: target || null, reason: clean(m[3], 500) };
  }
  return { verdict: 'UNKNOWN' };
}

// ---------- Audit & data helper ----------
export async function audit(agent, eventType, message, metadata = {}) {
  try { await sb('/rest/v1/nexora_activity_logs', { method: 'POST', body: { agent_name: clean(agent, 80) || 'System', event_type: eventType, message: clean(message, 3000), metadata } }); } catch { /* audit tidak boleh menggagalkan proses utama */ }
}

export async function getTask(id) {
  const rows = await sb(`/rest/v1/nexora_tasks?id=eq.${enc(need(id, 'ID task'))}&select=*`);
  if (!rows?.[0]) throw httpError(404, 'Task tidak ditemukan.');
  return rows[0];
}
export async function getProject(id) {
  const rows = await sb(`/rest/v1/nexora_projects?id=eq.${enc(need(id, 'ID proyek'))}&select=*`);
  if (!rows?.[0]) throw httpError(404, 'Proyek tidak ditemukan.');
  return rows[0];
}
export async function loadGraph(projectId) {
  const tasks = await sb(`/rest/v1/nexora_tasks?project_id=eq.${enc(projectId)}&select=*&order=step_order.asc,created_at.asc`) || [];
  const ids = tasks.map(t => t.id);
  const deps = ids.length ? await sb(`/rest/v1/nexora_task_dependencies?task_id=in.(${ids.join(',')})&select=task_id,depends_on`) || [] : [];
  return { tasks, deps };
}

// Ubah status dengan validasi + guard atomik (status asal harus masih sama).
export async function transition(task, to, extra = {}, actor = 'System') {
  if (!canTransition(task.status, to)) throw httpError(409, `Transisi status tidak diizinkan: ${task.status} → ${to}.`);
  const rows = await sb(`/rest/v1/nexora_tasks?id=eq.${enc(task.id)}&status=eq.${enc(task.status)}`, {
    method: 'PATCH', body: { status: to, updated_at: nowIso(), ...extra }, headers: REP
  });
  if (!rows?.[0]) throw httpError(409, 'Status task sudah berubah oleh proses lain. Muat ulang data.');
  await audit(actor, 'task_status', `${task.title}: ${task.status} → ${to}`, { taskId: task.id, from: task.status, to });
  return rows[0];
}

export async function addMessage({ projectId = null, taskId = null, sender, recipients = [], kind = 'note', body, outputRef = null, idempotencyKey = null, status = 'delivered' }) {
  const row = { project_id: projectId, task_id: taskId, sender: clean(sender, 40), recipients, kind, body: clean(body, 8000), status, output_ref: outputRef, idempotency_key: idempotencyKey };
  if (!row.body) throw httpError(400, 'Isi pesan wajib diisi.');
  const q = idempotencyKey ? '?on_conflict=idempotency_key' : '';
  const rows = await sb(`/rest/v1/nexora_agent_messages${q}`, { method: 'POST', body: row, headers: { Prefer: `return=representation${idempotencyKey ? ',resolution=ignore-duplicates' : ''}` } });
  return rows?.[0] || null; // null = duplikat yang diabaikan
}

// Buka task yang semua dependensinya selesai; hitung ulang status proyek.
export async function promote(projectId) {
  const { tasks, deps } = await loadGraph(projectId);
  const byId = new Map(tasks.map(t => [t.id, t]));
  const promoted = [];
  for (const t of tasks) {
    if (t.status !== 'blocked') continue;
    const mine = deps.filter(d => d.task_id === t.id);
    if (mine.every(d => byId.get(d.depends_on)?.status === 'completed')) {
      await sb(`/rest/v1/nexora_tasks?id=eq.${enc(t.id)}&status=eq.blocked`, { method: 'PATCH', body: { status: 'queued', updated_at: nowIso() } });
      promoted.push(t.id);
    }
  }
  await refreshProject(projectId);
  return promoted;
}

export async function refreshProject(projectId) {
  const [project] = await sb(`/rest/v1/nexora_projects?id=eq.${enc(projectId)}&select=id,status`) || [];
  if (!project || project.status === 'cancelled') return;
  const { tasks } = await loadGraph(projectId);
  const pending = await sbCount(`/rest/v1/nexora_approvals?project_id=eq.${enc(projectId)}&status=eq.pending&select=id`);
  const status = tasks.length && tasks.every(t => t.status === 'completed') ? 'completed' : pending > 0 ? 'awaiting_approval' : 'active';
  if (status !== project.status) await sb(`/rest/v1/nexora_projects?id=eq.${enc(projectId)}`, { method: 'PATCH', body: { status, updated_at: nowIso() } });
}

// Kembalikan satu task ke tahap revisi; tahap hilir dikunci ulang (bukan mengulang seluruh pipeline).
export async function requestRevision(task, { note, sender, projectId }) {
  if ((task.revision_count || 0) >= MAX_REVISIONS) return false;
  const updated = await transition(task, 'revision', { revision_count: (task.revision_count || 0) + 1, error: null, finished_at: null }, sender);
  const { tasks, deps } = await loadGraph(projectId);
  const down = downstreamOf(task.id, deps);
  const affected = tasks.filter(t => down.has(t.id) && t.status !== 'blocked');
  for (const t of affected) {
    await sb(`/rest/v1/nexora_tasks?id=eq.${enc(t.id)}`, { method: 'PATCH', body: { status: 'blocked', updated_at: nowIso(), finished_at: null } });
  }
  if (down.size) await sb(`/rest/v1/nexora_approvals?task_id=in.(${[...down].join(',')})&status=eq.pending`, { method: 'PATCH', body: { status: 'rejected', decided_note: 'Dibatalkan: tahap hulu direvisi.', decided_at: nowIso() } });
  await addMessage({ projectId, taskId: task.id, sender, recipients: [task.agent_name], kind: 'revision_request', body: note || 'Mohon revisi hasil sebelumnya.' });
  await audit(sender, 'revision_requested', `Revisi diminta untuk ${task.title} (${updated.revision_count}/${MAX_REVISIONS}).`, { taskId: task.id, downstreamReset: affected.length });
  return true;
}

// Task working yang macet (function mati / timeout) ditandai gagal agar bisa dicoba ulang.
export async function recoverStale(projectId) {
  const minutes = intEnv('NEXORA_STALE_MINUTES', 5, 1, 60);
  const cutoff = new Date(Date.now() - minutes * 60000).toISOString();
  const stale = await sb(`/rest/v1/nexora_tasks?project_id=eq.${enc(projectId)}&status=eq.working&updated_at=lt.${enc(cutoff)}&select=*`) || [];
  for (const t of stale) {
    const rows = await sb(`/rest/v1/nexora_tasks?id=eq.${enc(t.id)}&status=eq.working`, { method: 'PATCH', body: { status: 'failed', retry_count: (t.retry_count || 0) + 1, error: 'Proses tidak selesai (kedaluwarsa). Coba lagi.', updated_at: nowIso() }, headers: REP });
    if (rows?.[0]) {
      await sb(`/rest/v1/nexora_agent_runs?task_id=eq.${enc(t.id)}&status=eq.running`, { method: 'PATCH', body: { status: 'failed', error: 'Kedaluwarsa', finished_at: nowIso() } });
      await audit('System', 'task_recovered', `${t.title} ditandai gagal karena tidak selesai dalam ${minutes} menit.`, { taskId: t.id });
    }
  }
  return stale.length;
}
