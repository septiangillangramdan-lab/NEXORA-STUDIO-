// NEXORA STUDIO v2.0.2 — eksekusi Agent: prepareRun (sinkron, terotentikasi) + finishRun (memanggil Gemini).
import {
  sb, sbCount, clean, intEnv, httpError, need, AGENTS, PIPELINE, REVISABLE, MAX_REVISIONS,
  audit, getTask, getProject, loadGraph, transition, addMessage, promote, refreshProject,
  requestRevision, recoverStale, parseVerdict
} from './nexora.mjs';

const enc = encodeURIComponent;
const REP = { Prefer: 'return=representation' };
const nowIso = () => new Date().toISOString();
// ---------- Provider AI: rantai penyedia (v2.0.2) ----------
// Penyedia utama (NEXORA_AI_* atau GEMINI_API_KEY) lalu slot bernomor NEXORA_AI1_* ... NEXORA_AI6_*.
// Bila satu penyedia gagal (kuota, timeout, key salah, jawaban kosong), otomatis dicoba penyedia berikutnya.
// Slot boleh dikhususkan untuk Agent tertentu lewat NEXORA_AI{n}_AGENTS=Arka,Nara (Agent lain tidak memakainya).
const SLOTS = 6;
const MODEL_RE = /^[A-Za-z0-9._:\/-]{3,100}$/;
const envv = k => (process.env[k] || '').trim();
const hostLabel = base => { try { return new URL(base).hostname.replace(/^api\./, ''); } catch { return 'penyedia'; } };
const agentList = s => s.split(',').map(x => x.trim().toLowerCase()).filter(Boolean);

function buildProvider({ id, name, kind, key, base, model, fallback, agents, keyVar, modelVar, baseVar }) {
  const problems = [];
  const models = [model, fallback].filter((m, i, a) => m && a.indexOf(m) === i);
  if (!key) problems.push(`${keyVar} belum diatur`);
  if (!models.length) problems.push(`${modelVar} wajib diisi`);
  else if (models.some(m => !MODEL_RE.test(m))) problems.push(`format ${modelVar} tidak valid`);
  if (kind === 'openai-compatible' && !/^https:\/\//i.test(base || '')) problems.push(`${baseVar} harus diawali https://`);
  return { id, label: name || (kind === 'gemini' ? 'Gemini' : hostLabel(base)), provider: kind, key, base, models, agents, problems };
}
function mainProvider() {
  const kind = envv('NEXORA_AI_PROVIDER') === 'openai-compatible' ? 'openai-compatible' : 'gemini';
  return buildProvider({
    id: 'utama', kind, name: envv('NEXORA_AI_NAME'),
    key: kind === 'gemini' ? envv('GEMINI_API_KEY') : envv('NEXORA_AI_API_KEY'),
    base: (envv('NEXORA_AI_BASE_URL') || 'https://api.xkiro.com/v1').replace(/\/+$/, ''),
    model: envv('NEXORA_AI_MODEL') || (kind === 'gemini' ? 'gemini-2.5-flash' : ''),
    fallback: envv('NEXORA_AI_FALLBACK_MODEL'), agents: agentList(envv('NEXORA_AI_AGENTS')),
    keyVar: kind === 'gemini' ? 'GEMINI_API_KEY' : 'NEXORA_AI_API_KEY', modelVar: 'NEXORA_AI_MODEL', baseVar: 'NEXORA_AI_BASE_URL'
  });
}
function slotProvider(n) {
  const p = `NEXORA_AI${n}_`;
  const raw = { kind: envv(p + 'PROVIDER').toLowerCase(), key: envv(p + 'API_KEY'), base: envv(p + 'BASE_URL'), model: envv(p + 'MODEL'), fallback: envv(p + 'FALLBACK_MODEL'), name: envv(p + 'NAME'), agents: envv(p + 'AGENTS') };
  if (!Object.values(raw).some(Boolean)) return null; // slot kosong
  const kind = raw.kind === 'gemini' ? 'gemini' : 'openai-compatible';
  return buildProvider({
    id: `slot${n}`, kind, name: raw.name, key: raw.key || (kind === 'gemini' ? envv('GEMINI_API_KEY') : ''),
    base: raw.base.replace(/\/+$/, ''), model: raw.model || (kind === 'gemini' ? 'gemini-2.5-flash' : ''),
    fallback: raw.fallback, agents: agentList(raw.agents), keyVar: p + 'API_KEY', modelVar: p + 'MODEL', baseVar: p + 'BASE_URL'
  });
}
// Daftar penyedia yang siap dipakai (chain) + masalah konfigurasi yang perlu diperbaiki (problems).
export function aiConfig() {
  const all = [mainProvider(), ...Array.from({ length: SLOTS }, (_, i) => slotProvider(i + 1)).filter(Boolean)];
  const chain = all.filter(p => !p.problems.length);
  const mainTouched = ['NEXORA_AI_PROVIDER', 'NEXORA_AI_API_KEY', 'NEXORA_AI_BASE_URL', 'NEXORA_AI_MODEL', 'NEXORA_AI_FALLBACK_MODEL'].some(envv);
  const problems = all.filter(p => p.problems.length && (p.id !== 'utama' || mainTouched || !chain.length))
    .flatMap(p => p.problems.map(x => `${p.id === 'utama' ? 'Utama' : 'Slot ' + p.id.slice(4)}: ${x}`));
  return { chain, problems };
}
// Ringkasan aman untuk UI (tanpa key).
export function aiStatus() {
  const { chain, problems } = aiConfig();
  return {
    provider: chain[0]?.provider || null, model: chain[0]?.models[0] || null, fallbackModel: chain[0]?.models[1] || null,
    keyDetected: chain.length > 0, problems,
    chain: chain.map(p => ({ id: p.id, label: p.label, provider: p.provider, models: p.models, agents: p.agents }))
  };
}
function checkAi() {
  const { chain, problems } = aiConfig();
  if (!chain.length) throw httpError(503, `Belum ada penyedia AI yang siap di Environment Variables Netlify. ${problems.join('; ')}.`.trim());
  return { chain, problems, primaryModel: chain[0].models[0] };
}

// Pilih task berikutnya (atau task tertentu), cek dependensi & kuota harian, lalu klaim secara atomik.
export async function prepareRun({ taskId, projectId }) {
  const ai = checkAi();
  let task;
  if (taskId) { task = await getTask(taskId); projectId = task.project_id; }
  else {
    need(projectId, 'ID proyek');
    await recoverStale(projectId);
    const rows = await sb(`/rest/v1/nexora_tasks?project_id=eq.${enc(projectId)}&status=in.(queued,revision)&select=*&order=step_order.asc&limit=1`);
    task = rows?.[0];
    if (!task) return { idle: true, message: 'Tidak ada task yang siap dijalankan.' };
  }
  if (taskId) await recoverStale(projectId);
  task = await getTask(task.id);
  if (!['queued', 'revision'].includes(task.status)) throw httpError(409, `Task berstatus "${task.status}" dan tidak bisa dijalankan.`);

  const { tasks, deps } = await loadGraph(projectId);
  const byId = new Map(tasks.map(t => [t.id, t]));
  const waiting = deps.filter(d => d.task_id === task.id && byId.get(d.depends_on)?.status !== 'completed');
  if (waiting.length) throw httpError(409, 'Task masih menunggu dependensi selesai.');

  const limit = intEnv('NEXORA_DAILY_AI_LIMIT', 40, 1, 5000);
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const used = await sbCount(`/rest/v1/nexora_agent_runs?started_at=gte.${enc(today.toISOString())}&select=id`);
  if (used >= limit) throw httpError(429, `Batas panggilan AI harian (${limit}) tercapai. Naikkan NEXORA_DAILY_AI_LIMIT atau lanjutkan besok.`);

  const claimed = await transition(task, 'working', { started_at: nowIso(), finished_at: null, error: null }, task.agent_name);
  const attempts = await sbCount(`/rest/v1/nexora_agent_runs?task_id=eq.${enc(task.id)}&select=id`);
  const [run] = await sb('/rest/v1/nexora_agent_runs', { method: 'POST', body: { task_id: task.id, agent_name: task.agent_name, attempt: attempts + 1, status: 'running', model: ai.primaryModel }, headers: REP });
  return { runId: run.id, taskId: task.id, agent: task.agent_name, title: claimed.title, attempt: run.attempt, usedToday: used + 1, dailyLimit: limit };
}

// ---------- Konteks bersama (Shared Agent Brain) ----------
const STOP = new Set('yang dan di ke dari untuk dengan pada ini itu atau akan adalah dalam the a of to in is'.split(' '));
const tokens = (s) => String(s || '').toLowerCase().match(/[a-z0-9\u00c0-\u024f]{3,}/g)?.filter(w => !STOP.has(w)) || [];

async function relevantMemories(project, task, limit = 5) {
  const rows = await sb('/rest/v1/nexora_memories?select=agent_name,category,title,body&order=created_at.desc&limit=200') || [];
  const q = new Set(tokens(`${project.title} ${project.brief} ${task.title}`));
  return rows.map(m => {
    const words = tokens(`${m.title} ${m.body}`);
    let score = 0; for (const w of new Set(words)) if (q.has(w)) score++;
    if (m.agent_name === task.agent_name) score += 1;
    return { m, score };
  }).filter(x => x.score >= 2).sort((a, b) => b.score - a.score).slice(0, limit).map(x => x.m);
}

function buildPrompt({ project, task, step, reads, inbox, memories }) {
  const cut = (s, n) => String(s || '').slice(0, n);
  const parts = [
    `Kamu adalah ${task.agent_name}, ${AGENTS[task.agent_name] || 'Agent'} di NEXORA STUDIO (studio produksi konten video pendek berbasis AI). Bahasa kerja: Indonesia.`,
    `PROYEK: ${project.title}\nBRIEF CEO: ${cut(project.brief, 2500) || '(tidak ada brief tambahan)'}`,
    `TUGASMU: ${task.title}\n${step?.ask || task.details || ''}`.trim()
  ];
  if (task.details && step?.ask && task.details !== step.ask) parts.push(`CATATAN TAMBAHAN: ${cut(task.details, 1500)}`);
  if (reads.length) parts.push('HASIL TAHAP SEBELUMNYA (rujukan, jangan diulang):\n' + reads.map(r => `### ${r.agent} — ${r.title}\n${cut(r.result, 1800)}`).join('\n\n'));
  if (inbox.length) parts.push('PESAN UNTUKMU (utamakan, terutama permintaan revisi):\n' + inbox.map(m => `- dari ${m.sender} [${m.kind}]: ${cut(m.body, 700)}`).join('\n'));
  if (task.result && task.status !== 'queued') parts.push(`VERSI SEBELUMNYA (perbaiki sesuai pesan di atas):\n${cut(task.result, 2500)}`);
  if (memories.length) parts.push('MEMORI RELEVAN DARI PERUSAHAAN:\n' + memories.map(m => `- (${m.agent_name}/${m.category}) ${m.title}: ${cut(m.body, 500)}`).join('\n'));
  parts.push('ATURAN: kerjakan hanya peranmu; tulis dokumen kerja yang ringkas dan siap dipakai tahap berikutnya (maksimal sekitar 600 kata). Jangan mengaku sudah membuat file gambar/audio/video atau memverifikasi sumber web; kamu hanya menghasilkan teks. Tulis "perlu verifikasi" untuk fakta yang tidak pasti. Jangan memuat data pribadi atau rahasia.');
  return parts.join('\n\n');
}

async function callOne(ai, model, prompt, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res, data;
    if (ai.provider === 'gemini') {
      const generationConfig = { temperature: 0.7, maxOutputTokens: 2048 };
      if (/2\.5-flash/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': ai.key },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig })
      });
      data = await res.json().catch(() => ({}));
      if (!res.ok) { const e = new Error(clean(data?.error?.message || `Gemini API status ${res.status}.`, 400)); e.status = res.status; throw e; }
      let text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('\n').trim();
      if (!text) throw new Error('Model tidak memberikan teks (mungkin diblokir filter keamanan).');
      if (data.candidates?.[0]?.finishReason === 'MAX_TOKENS') text += '\n\n[Output terpotong karena batas token.]';
      return { text, model, usage: data.usageMetadata || null };
    }
    res = await fetch(`${ai.base}/chat/completions`, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.key}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 2048 })
    });
    data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(clean(data?.error?.message || data?.message || `Provider AI status ${res.status}.`, 400)); e.status = res.status; throw e; }
    const choice = data.choices?.[0];
    let text = String(Array.isArray(choice?.message?.content) ? choice.message.content.map(c => c.text || '').join('') : choice?.message?.content || '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    if (!text) throw new Error('Model tidak memberikan teks.');
    if (choice?.finish_reason === 'length') text += '\n\n[Output terpotong karena batas token.]';
    const u = data.usage || {};
    return { text, model, usage: { promptTokenCount: u.prompt_tokens ?? null, candidatesTokenCount: u.completion_tokens ?? null, totalTokenCount: u.total_tokens ?? null } };
  } catch (e) {
    if (e.name === 'AbortError') { const err = new Error(`Waktu tunggu model habis (${Math.round(timeoutMs / 1000)} dtk).`); err.timeout = true; throw err; }
    throw e;
  } finally { clearTimeout(timer); }
}

// Urutan penyedia untuk satu Agent: slot khusus Agent itu dulu, lalu slot umum.
function orderFor(chain, agent) {
  const a = String(agent || '').toLowerCase();
  const mine = chain.filter(p => p.agents.includes(a));
  const general = chain.filter(p => !p.agents.length);
  return mine.length || general.length ? [...mine, ...general] : chain;
}
const isTransient = t => t.timeout || t.status === 408 || t.status === 429 || t.status >= 500;
// Coba tiap penyedia (dan model cadangannya) berurutan sampai ada yang menjawab.
export async function callModel(prompt, timeoutMs, agent) {
  const { chain } = checkAi();
  const attempts = orderFor(chain, agent).flatMap(p => p.models.map(model => [p, model]));
  // Percobaan yang bukan terakhir dibatasi ±70% anggaran waktu (minimal 15 dtk atau seluruh anggaran bila lebih kecil),
  // supaya penyedia yang menggantung tidak menghabiskan waktu untuk cadangannya.
  const cap = Math.max(Math.floor(timeoutMs * 0.7), Math.min(timeoutMs, 15000));
  const started = Date.now(); const tried = []; let last;
  for (let i = 0; i < attempts.length; i++) {
    const [p, model] = attempts[i];
    const left = timeoutMs - (Date.now() - started);
    if (last && left < 3000) break;
    const budget = i === attempts.length - 1 ? left : Math.min(left, cap);
    try { const out = await callOne(p, model, prompt, budget); return { ...out, provider: p.label }; }
    catch (e) { last = e; tried.push({ who: `${p.label} · ${model}`, status: e.status, timeout: !!e.timeout, message: e.message }); }
  }
  if (tried.length === 1) throw last; // satu percobaan saja: perilaku sama seperti v2.0.1
  const err = new Error(clean(`Semua penyedia AI gagal: ${tried.map(t => `${t.who} (${t.status || (t.timeout ? 'timeout' : 'galat')})`).join('; ')}. Terakhir: ${last.message}`, 400));
  // Kuota penuh di semua penyedia (tanpa kegagalan permanen) -> task kembali ke antrean tanpa memotong jatah retry.
  if (tried.every(isTransient) && tried.some(t => t.status === 429)) err.status = 429;
  else if (tried.every(isTransient) && tried.every(t => t.timeout)) err.timeout = true;
  throw err;
}

// Dijalankan oleh agent-run (sinkron) atau agent-run-background. Aman terhadap pemanggilan ganda.
export async function finishRun(runId, { timeoutMs }) {
  const claim = await sb(`/rest/v1/nexora_agent_runs?id=eq.${enc(need(runId, 'ID run'))}&status=eq.running&executing=eq.false`, { method: 'PATCH', body: { executing: true }, headers: REP });
  const run = claim?.[0];
  if (!run) return { skipped: true };
  const task = await getTask(run.task_id);
  const projectId = task.project_id;
  try {
    const project = await getProject(projectId);
    const step = PIPELINE.find(s => s.key === task.step_key);
    const { tasks, deps } = await loadGraph(projectId);
    const byId = new Map(tasks.map(t => [t.id, t]));
    const keys = new Set([...(step?.reads || [])]);
    const readTasks = [...deps.filter(d => d.task_id === task.id).map(d => byId.get(d.depends_on)), ...tasks.filter(t => keys.has(t.step_key))]
      .filter((t, i, arr) => t && t.result && arr.findIndex(x => x.id === t.id) === i);
    const reads = readTasks.map(t => ({ agent: t.agent_name, title: t.title, result: t.result }));
    const inbox = await sb(`/rest/v1/nexora_agent_messages?project_id=eq.${enc(projectId)}&status=in.(pending,delivered)&recipients=cs.${enc(`{${task.agent_name}}`)}&select=id,sender,kind,body&order=created_at.asc&limit=8`) || [];
    const memories = await relevantMemories(project, task);

    const out = await callModel(buildPrompt({ project, task, step, reads, inbox, memories }), timeoutMs, task.agent_name);

    if (inbox.length) await sb(`/rest/v1/nexora_agent_messages?id=in.(${inbox.map(m => m.id).join(',')})`, { method: 'PATCH', body: { status: 'read' } });
    await sb(`/rest/v1/nexora_agent_runs?id=eq.${enc(run.id)}`, { method: 'PATCH', body: { status: 'succeeded', output: out.text, tokens: out.usage, model: out.provider ? `${out.provider} · ${out.model}` : out.model, finished_at: nowIso() } });

    // Elara (QC): kembalikan hanya tahap yang bermasalah.
    if (task.step_key === 'qc') {
      const v = parseVerdict(out.text);
      if (v.verdict === 'REVISE') {
        const target = v.target && REVISABLE.has(v.target) ? tasks.find(t => t.agent_name === v.target && t.status === 'completed') : null;
        const current = await getTask(task.id);
        await sb(`/rest/v1/nexora_tasks?id=eq.${enc(task.id)}`, { method: 'PATCH', body: { result: out.text, updated_at: nowIso() } });
        if (target && await requestRevision(target, { note: `QC (Elara): ${v.reason || 'perlu perbaikan'}`, sender: 'Elara', projectId })) {
          await refreshProject(projectId);
          return { ok: true, outcome: 'qc_revision', target: v.target };
        }
        // Target tidak jelas atau batas revisi (${MAX_REVISIONS}) tercapai → CEO memutuskan.
        await escalate(current, project, out.text, `QC meminta revisi${v.target ? ` (${v.target})` : ''}, tetapi tidak bisa diulang otomatis.`);
        return { ok: true, outcome: 'qc_escalated' };
      }
    }

    const needsApproval = step?.approval && project.approval_mode === 'manual';
    const patch = { result: out.text, error: null, finished_at: nowIso() };
    if (needsApproval) {
      await transition(task, 'awaiting_approval', patch, task.agent_name);
      await sb('/rest/v1/nexora_approvals', { method: 'POST', body: { project_id: projectId, task_id: task.id, title: `Setujui: ${task.title}`, details: clean(out.text, 6000) } });
    } else {
      await transition(task, 'completed', patch, task.agent_name);
    }

    const children = deps.filter(d => d.depends_on === task.id).map(d => byId.get(d.task_id)?.agent_name).filter(Boolean);
    await addMessage({ projectId, taskId: task.id, sender: task.agent_name, recipients: [...new Set(children)].length ? [...new Set(children)] : ['Septian'], kind: 'result', body: `${task.title} ${needsApproval ? 'selesai dan menunggu persetujuan CEO' : 'selesai'}.\n\n${clean(out.text, 700)}`, outputRef: run.id, idempotencyKey: `result:${run.id}` });
    await saveMemory(project, task, out.text);
    if (!needsApproval) await promote(projectId); else await refreshProject(projectId);
    return { ok: true, outcome: needsApproval ? 'awaiting_approval' : 'completed' };
  } catch (e) {
    return await failRun(run, task, e);
  }
}

async function escalate(task, project, text, reason) {
  await sb('/rest/v1/nexora_approvals', { method: 'POST', body: { project_id: project.id, task_id: task.id, title: `Keputusan CEO: ${task.title}`, details: `${reason}\n\n${clean(text, 5500)}` } });
  const fresh = await getTask(task.id);
  if (fresh.status === 'working') await transition(fresh, 'awaiting_approval', { finished_at: nowIso() }, task.agent_name);
  await refreshProject(project.id);
}

async function saveMemory(project, task, text) {
  try {
    const title = clean(`[${project.title}] ${task.agent_name}: ${task.title}`, 120);
    const exists = await sbCount(`/rest/v1/nexora_memories?title=eq.${enc(title)}&select=id`);
    if (exists) { await sb(`/rest/v1/nexora_memories?title=eq.${enc(title)}`, { method: 'PATCH', body: { body: clean(text, 2500), updated_at: nowIso() } }); return; }
    await sb('/rest/v1/nexora_memories', { method: 'POST', body: { agent_name: task.agent_name, category: 'Hasil Kerja', title, body: clean(text, 2500), updated_at: nowIso() } });
  } catch { /* penyimpanan memori bersifat pelengkap */ }
}

async function failRun(run, task, e) {
  const message = clean(e.message || 'Eksekusi gagal.', 400);
  await sb(`/rest/v1/nexora_agent_runs?id=eq.${enc(run.id)}`, { method: 'PATCH', body: { status: 'failed', error: message, finished_at: nowIso() } }).catch(() => {});
  const fresh = await getTask(task.id).catch(() => task);
  if (e.status === 429) { // kuota provider: kembalikan ke antrean tanpa menghabiskan jatah retry
    if (fresh.status === 'working') await transition(fresh, 'queued', { error: 'Kuota penyedia AI habis sementara. Coba lagi beberapa saat.' }, task.agent_name).catch(() => {});
    await audit(task.agent_name, 'quota', `Kuota provider penuh saat menjalankan ${task.title}.`, { taskId: task.id });
    return { ok: false, quota: true, error: message };
  }
  if (fresh.status === 'working') await transition(fresh, 'failed', { retry_count: (fresh.retry_count || 0) + 1, error: message, finished_at: nowIso() }, task.agent_name).catch(() => {});
  await audit(task.agent_name, 'run_failed', `${task.title} gagal: ${message}`, { taskId: task.id, runId: run.id });
  return { ok: false, error: message };
}
