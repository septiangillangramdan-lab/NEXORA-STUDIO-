// NEXORA STUDIO v2.0.0 — Agent Room: proyek, task, pesan antar-Agent, persetujuan CEO, riwayat produksi.
// Semua data ada di Supabase via Netlify Function; kode akses diambil dari sesi Cloud Center.
const $ = id => document.getElementById(id);
const AGENTS = ['Septian', 'Arka', 'Nara', 'Saka', 'Raka', 'Kirana', 'Aira', 'Kairo', 'Viona', 'Damar', 'Elara'];
const WORKERS = AGENTS.filter(a => a !== 'Septian');
const STATUS_LABEL = { queued: 'Antre', blocked: 'Menunggu', working: 'Bekerja', awaiting_approval: 'Butuh persetujuan', revision: 'Revisi', completed: 'Selesai', failed: 'Gagal', review: 'Review', approved: 'Disetujui' };
const S = { projects: [], id: null, detail: null, busy: false, stop: false, projectKey: crypto.randomUUID(), pollTimer: null };
const code = () => sessionStorage.getItem('nexora_cloud_code') || '';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const mode = () => localStorage.getItem('nexora_run_mode') || 'background';

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function btn(label, cls, onClick, disabled = false) { const b = el('button', cls, label); b.type = 'button'; b.disabled = disabled; b.addEventListener('click', onClick); return b; }
function note(message, type = 'info') { const e = $('collab-status'); if (e) { e.textContent = message; e.className = `composer-hint cloud-status ${type}`; } }
const when = v => v ? new Date(v).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '-';

async function post(fn, data) {
  const res = await fetch(`/.netlify/functions/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessCode: code(), ...data }) });
  if (fn === 'agent-run-background') { if (!res.ok) throw new Error(`Background Function tidak merespons (${res.status}). Ganti "Mode eksekusi" ke Langsung atau cek deploy.`); return {}; }
  const out = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(out.error || `Permintaan gagal (${res.status}).`); e.status = res.status; throw e; }
  return out;
}
const api = (action, data = {}) => {
  if (!code()) throw new Error('Hubungkan Cloud Center terlebih dahulu (menu Cloud Center), lalu kembali ke sini.');
  return post('collab', { action, ...data });
};

// ---------- data ----------
async function loadProjects() {
  const r = await api('project.list'); S.projects = r.items || [];
  renderProjects();
  if (!S.id && S.projects[0]) await openProject(S.projects[0].id);
}
async function openProject(id) { S.id = id; await refresh(); renderProjects(); }
async function refresh() {
  if (!S.id) { S.detail = null; render(); return; }
  S.detail = await api('project.get', { id: S.id });
  const i = S.projects.findIndex(p => p.id === S.id); if (i >= 0) S.projects[i] = S.detail.project;
  render(); renderProjects();
}
const guard = fn => async (...a) => { try { await fn(...a); } catch (e) { note(e.message, 'error'); S.busy = false; render(); } };

// ---------- eksekusi Agent ----------
async function runOne(target) {
  const p = await api('run.prepare', target);
  if (p.idle) return { idle: true, message: p.message };
  note(`${p.agent} mengerjakan "${p.title}" (percobaan ${p.attempt}, panggilan AI hari ini ${p.usedToday}/${p.dailyLimit})...`);
  await refresh();
  if (mode() === 'direct') {
    const r = await post('agent-run', { runId: p.runId });
    await refresh();
    return { ok: !!r.ok, quota: !!r.quota, error: r.error, outcome: r.outcome, agent: p.agent };
  }
  await post('agent-run-background', { runId: p.runId });
  for (let i = 0; i < 80; i++) { // ± 4 menit
    await sleep(3000);
    await refresh();
    const run = S.detail.runs.find(x => x.id === p.runId);
    if (run && run.status !== 'running') return { ok: run.status === 'succeeded', error: run.error, quota: /kuota/i.test(run.error || ''), agent: p.agent };
    const t = S.detail.tasks.find(x => x.id === p.taskId);
    if (t && t.status !== 'working') return { ok: t.status !== 'failed', error: t.error, agent: p.agent };
  }
  return { ok: false, error: 'Menunggu terlalu lama. Muat ulang; task kedaluwarsa akan ditandai gagal otomatis.', agent: p.agent };
}

async function runSingle(target) {
  if (S.busy) return; S.busy = true; render();
  try {
    const r = await runOne(target);
    note(r.idle ? r.message : r.ok ? `${r.agent} selesai.` : `${r.agent} gagal: ${r.error}`, r.idle || r.ok ? 'success' : 'error');
  } finally { S.busy = false; await refresh(); }
}

async function runAll() {
  if (S.busy) return; S.busy = true; S.stop = false; render();
  let done = 0;
  try {
    while (!S.stop) {
      const r = await runOne({ projectId: S.id });
      if (r.idle) { note(done ? `Berhenti: tidak ada task siap. ${done} task dijalankan. Cek persetujuan atau task gagal.` : r.message, 'success'); break; }
      if (!r.ok) { note(`Berhenti: ${r.agent} gagal${r.quota ? ' (kuota)' : ''}. ${r.error || ''}`, 'error'); break; }
      done++; await sleep(7000); // jeda agar tidak menabrak batas per-menit tier gratis
    }
    if (S.stop) note(`Dihentikan setelah ${done} task.`);
  } finally { S.busy = false; await refresh(); }
}

// ---------- render ----------
function renderProjects() {
  const host = $('collab-project-list'); if (!host) return; host.innerHTML = '';
  $('collab-project-count').textContent = String(S.projects.length);
  if (!S.projects.length) { host.append(el('div', 'empty-timeline', 'Belum ada proyek. Buat brief pertama di atas.')); return; }
  S.projects.forEach(p => {
    const c = el('article', 'cloud-record collab-pick' + (p.id === S.id ? ' active' : ''));
    c.append(el('b', '', p.title), el('small', '', `${p.status} · ${p.approval_mode === 'manual' ? 'perlu persetujuan CEO' : 'otomatis'} · ${when(p.created_at)}`));
    c.addEventListener('click', guard(() => openProject(p.id)));
    host.append(c);
  });
}

function render() {
  const d = S.detail, work = $('collab-workspace'); if (!work) return;
  work.hidden = !d; if (!d) return;
  const { project, tasks, deps, messages, runs, approvals } = d;
  const byId = new Map(tasks.map(t => [t.id, t]));
  const done = tasks.filter(t => t.status === 'completed').length;
  $('collab-title').textContent = project.title;
  $('collab-sub').textContent = `${project.status} · ${done}/${tasks.length} task selesai`;
  $('collab-bar').style.width = `${tasks.length ? Math.round(done / tasks.length * 100) : 0}%`;
  $('collab-run-all').disabled = S.busy; $('collab-stop').hidden = !S.busy; $('collab-run-one').disabled = S.busy;

  const list = $('collab-task-list'); list.innerHTML = '';
  tasks.forEach(t => {
    const c = el('article', `cloud-record collab-task st-${t.status}`);
    const head = el('div', 'collab-task-head'); head.append(el('b', '', `${t.step_order + 1}. ${t.title}`), el('span', `collab-badge st-${t.status}`, STATUS_LABEL[t.status] || t.status));
    c.append(head, el('small', '', `${t.agent_name} · percobaan gagal ${t.retry_count}/${t.max_retries} · revisi ${t.revision_count}/${d.maxRevisions}`));
    const waiting = deps.filter(x => x.task_id === t.id).map(x => byId.get(x.depends_on)).filter(x => x && x.status !== 'completed');
    if (t.status === 'blocked' && waiting.length) c.append(el('small', 'collab-wait', `Menunggu: ${waiting.map(w => w.agent_name).join(', ')}`));
    if (t.error && ['failed', 'queued'].includes(t.status)) c.append(el('p', 'collab-error', t.error));
    if (t.result) { const dt = el('details'); dt.append(el('summary', '', 'Lihat hasil'), el('pre', 'collab-pre', t.result)); c.append(dt); }
    const act = el('div', 'cloud-record-actions');
    if (['queued', 'revision'].includes(t.status)) act.append(btn('▶ Jalankan', 'secondary-button', guard(() => runSingle({ taskId: t.id })), S.busy));
    if (t.status === 'failed') {
      if (t.retry_count < t.max_retries) act.append(btn('↻ Coba lagi', 'secondary-button', guard(async () => { await api('task.retry', { id: t.id }); await runSingle({ taskId: t.id }); }), S.busy));
      else act.append(el('small', 'collab-error', 'Batas percobaan habis'));
      const sel = el('select', 'style-input collab-mini'); WORKERS.forEach(a => sel.add(new Option(a, a, false, a === t.agent_name)));
      act.append(sel, btn('Alihkan', 'secondary-button', guard(async () => { await api('task.reassign', { id: t.id, agentName: sel.value }); note(`Task dialihkan ke ${sel.value}.`, 'success'); await refresh(); }), S.busy));
    }
    if (['completed', 'awaiting_approval'].includes(t.status) && t.revision_count < d.maxRevisions) {
      act.append(btn('✎ Minta revisi', 'secondary-button', guard(async () => { const n = prompt(`Catatan revisi untuk ${t.agent_name}:`); if (!n || !n.trim()) return; await api('task.revise', { id: t.id, note: n.trim() }); note('Revisi diminta; tahap hilir dikunci ulang.', 'success'); await refresh(); }), S.busy));
    }
    if (act.childNodes.length) c.append(act);
    list.append(c);
  });

  const apHost = $('collab-approval-list'); apHost.innerHTML = '';
  const pending = approvals.filter(a => a.status === 'pending');
  $('collab-approval-count').textContent = String(pending.length);
  if (!pending.length) apHost.append(el('div', 'empty-timeline', 'Tidak ada yang menunggu persetujuan.'));
  pending.forEach(a => {
    const c = el('article', 'cloud-record'); c.append(el('b', '', a.title));
    const dt = el('details'); dt.append(el('summary', '', 'Baca ringkasan'), el('pre', 'collab-pre', a.details)); c.append(dt);
    const input = el('input', 'style-input'); input.placeholder = 'Catatan (wajib bila menolak)'; input.maxLength = 500;
    const act = el('div', 'cloud-record-actions');
    act.append(
      btn('✓ Setujui', 'primary-button', guard(async () => { await api('approval.decide', { id: a.id, decision: 'approved', note: input.value }); note('Disetujui.', 'success'); await refresh(); })),
      btn('✕ Tolak & revisi', 'secondary-button', guard(async () => { if (!input.value.trim()) { note('Tulis catatan agar Agent tahu apa yang diperbaiki.', 'error'); return; } await api('approval.decide', { id: a.id, decision: 'rejected', note: input.value }); note('Ditolak; Agent diminta merevisi.', 'success'); await refresh(); })));
    c.append(input, act); apHost.append(c);
  });

  const msgHost = $('collab-message-list'); msgHost.innerHTML = '';
  if (!messages.length) msgHost.append(el('div', 'empty-timeline', 'Belum ada pesan.'));
  messages.slice(-60).forEach(m => {
    const c = el('article', `cloud-record compact collab-msg k-${m.kind}`);
    c.append(el('b', '', `${m.sender} → ${(m.recipients || []).join(', ') || 'Semua'}`), el('small', '', `${m.kind} · ${m.status} · ${when(m.created_at)}`), el('p', '', m.body));
    msgHost.append(c);
  });
  msgHost.scrollTop = msgHost.scrollHeight;

  const hist = $('collab-history-list'); hist.innerHTML = '';
  $('collab-run-count').textContent = String(runs.length);
  if (!runs.length) hist.append(el('div', 'empty-timeline', 'Belum ada eksekusi Agent.'));
  runs.slice(0, 40).forEach(r => {
    const t = byId.get(r.task_id);
    const c = el('article', 'cloud-record compact');
    c.append(el('b', '', `${r.agent_name} · ${t?.title || 'Task'} · percobaan ${r.attempt}`), el('small', '', `${r.status} · ${r.model || '-'} · ${r.tokens?.totalTokenCount ?? '-'} token · ${when(r.started_at)}`));
    if (r.error) c.append(el('p', 'collab-error', r.error));
    hist.append(c);
  });
}

// ---------- event ----------
$('collab-create')?.addEventListener('click', guard(async () => {
  const title = $('collab-new-title').value.trim(); if (!title) { note('Isi judul proyek.', 'error'); return; }
  const r = await api('project.create', { title, brief: $('collab-new-brief').value, approvalMode: $('collab-new-mode').value, idempotencyKey: S.projectKey });
  S.projectKey = crypto.randomUUID(); $('collab-new-title').value = ''; $('collab-new-brief').value = '';
  S.id = r.project.id; await loadProjects(); await openProject(r.project.id);
  note('Proyek dibuat. Arka siap menyusun rencana — tekan "Jalankan otomatis".', 'success');
}));
$('collab-reload')?.addEventListener('click', guard(async () => { await loadProjects(); if (S.id) await refresh(); note('Data dimuat ulang.', 'success'); }));
$('collab-run-one')?.addEventListener('click', guard(() => runSingle({ projectId: S.id })));
$('collab-run-all')?.addEventListener('click', guard(runAll));
$('collab-stop')?.addEventListener('click', () => { S.stop = true; note('Menghentikan setelah task berjalan selesai...'); });
$('collab-cancel')?.addEventListener('click', guard(async () => { if (!confirm('Batalkan proyek ini? Data tetap tersimpan sebagai riwayat.')) return; await api('project.cancel', { id: S.id }); await loadProjects(); await refresh(); }));
$('collab-mode')?.addEventListener('change', e => localStorage.setItem('nexora_run_mode', e.target.value));
if ($('collab-mode')) $('collab-mode').value = mode();
const to = $('collab-msg-to'); if (to) { to.add(new Option('Semua', '')); AGENTS.filter(a => a !== 'Septian').forEach(a => to.add(new Option(a, a))); }
$('collab-msg-send')?.addEventListener('click', guard(async () => {
  const body = $('collab-msg-body').value.trim(); if (!body || !S.id) { note('Tulis pesan terlebih dahulu.', 'error'); return; }
  await api('message.send', { projectId: S.id, sender: 'Septian', recipients: to.value ? [to.value] : [], kind: $('collab-msg-kind').value, body, idempotencyKey: crypto.randomUUID() });
  $('collab-msg-body').value = ''; await refresh(); note('Pesan terkirim. Agent membacanya saat tugasnya dijalankan berikutnya.', 'success');
}));
document.querySelectorAll('[data-view="collab"]').forEach(b => b.addEventListener('click', guard(async () => {
  if (!code()) { note('Belum terhubung ke cloud. Buka Cloud Center dan masukkan kode akses terlebih dahulu.', 'error'); return; }
  const h = await api('health'); note(`Terhubung · ${h.provider} · model ${h.model || '(belum diatur)'} · ${h.keyDetected ? 'API key terdeteksi' : 'API key BELUM diatur'} · batas harian ${h.dailyLimit} panggilan.`, h.keyDetected && h.model ? 'success' : 'error');
  await loadProjects();
})));
