// NEXORA STUDIO v2.0.0 — eksekusi Agent: prepareRun (sinkron, terotentikasi) + finishRun (memanggil Gemini).
import {
  sb, sbCount, clean, intEnv, httpError, need, AGENTS, PIPELINE, REVISABLE, MAX_REVISIONS,
  audit, getTask, getProject, loadGraph, transition, addMessage, promote, refreshProject,
  requestRevision, recoverStale, parseVerdict
} from './nexora.mjs';

const enc = encodeURIComponent;
const REP = { Prefer: 'return=representation' };
const nowIso = () => new Date().toISOString();
// ---------- Provider AI (Gemini atau API kompatibel OpenAI seperti xKiro) ----------
export function aiInfo() {
  const provider = process.env.NEXORA_AI_PROVIDER === 'openai-compatible' ? 'openai-compatible' : 'gemini';
  const key = provider === 'gemini' ? process.env.GEMINI_API_KEY : process.env.NEXORA_AI_API_KEY;
  const base = (process.env.NEXORA_AI_BASE_URL || 'https://api.xkiro.com/v1').replace(/\/+$/, '');
  const model = (process.env.NEXORA_AI_MODEL || (provider === 'gemini' ? 'gemini-2.5-flash' : '')).trim();
  const fallback = (process.env.NEXORA_AI_FALLBACK_MODEL || '').trim();
  return { provider, key: key || '', base, model, fallback };
}
const MODEL_RE = /^[A-Za-z0-9._:\/-]{3,100}$/;
function checkAi() {
  const ai = aiInfo();
  const keyName = ai.provider === 'gemini' ? 'GEMINI_API_KEY' : 'NEXORA_AI_API_KEY';
  if (!ai.key) throw httpError(503, `${keyName} belum diatur pada Environment Variables Netlify.`);
  if (!ai.model) throw httpError(503, 'NEXORA_AI_MODEL wajib diisi untuk provider openai-compatible (contoh: qwen/qwen3.8-max:free).');
  if (!MODEL_RE.test(ai.model) || (ai.fallback && !MODEL_RE.test(ai.fallback))) throw httpError(503, 'Format NEXORA_AI_MODEL / NEXORA_AI_FALLBACK_MODEL tidak valid.');
  if (ai.provider === 'openai-compatible' && !/^https:\/\//i.test(ai.base)) throw httpError(503, 'NEXORA_AI_BASE_URL harus diawali https://');
  return ai;
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
  const [run] = await sb('/rest/v1/nexora_agent_runs', { method: 'POST', body: { task_id: task.id, agent_name: task.agent_name, attempt: attempts + 1, status: 'running', model: ai.model }, headers: REP });
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

// Model utama dulu; bila gagal sementara (timeout/404/429/5xx) dan ada NEXORA_AI_FALLBACK_MODEL, coba cadangan.
async function callModel(prompt, timeoutMs) {
  const ai = checkAi();
  const models = [ai.model, ...(ai.fallback && ai.fallback !== ai.model ? [ai.fallback] : [])];
  const started = Date.now(); let last;
  for (const model of models) {
    const left = timeoutMs - (Date.now() - started);
    if (last && left < 3000) break;
    try { return await callOne(ai, model, prompt, last ? left : timeoutMs); }
    catch (e) { last = e; if (!(e.timeout || [404, 408, 429, 500, 502, 503, 504].includes(e.status))) throw e; }
  }
  throw last;
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

    const out = await callModel(buildPrompt({ project, task, step, reads, inbox, memories }), timeoutMs);

    if (inbox.length) await sb(`/rest/v1/nexora_agent_messages?id=in.(${inbox.map(m => m.id).join(',')})`, { method: 'PATCH', body: { status: 'read' } });
    await sb(`/rest/v1/nexora_agent_runs?id=eq.${enc(run.id)}`, { method: 'PATCH', body: { status: 'succeeded', output: out.text, tokens: out.usage, model: out.model, finished_at: nowIso() } });

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
