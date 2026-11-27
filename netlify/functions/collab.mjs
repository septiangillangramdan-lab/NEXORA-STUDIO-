// NEXORA STUDIO v2.0.0 — API kolaborasi Agent (POST saja, kode akses cloud wajib).
import {
  json, authorized, sb, clean, httpError, need, isUuid, intEnv, AGENTS, AGENT_NAMES, PIPELINE,
  audit, getTask, getProject, loadGraph, transition, addMessage, promote, refreshProject,
  requestRevision, recoverStale, MAX_REVISIONS
} from './lib/nexora.mjs';
import { prepareRun, aiInfo } from './lib/runner.mjs';

const enc = encodeURIComponent;
const REP = { Prefer: 'return=representation' };
const nowIso = () => new Date().toISOString();

async function createProject(b) {
  const title = clean(b.title, 160);
  if (!title) throw httpError(400, 'Judul proyek wajib diisi.');
  const key = clean(b.idempotencyKey, 100) || null;
  const mode = b.approvalMode === 'auto' ? 'auto' : 'manual';
  let project;
  if (key) project = (await sb(`/rest/v1/nexora_projects?idempotency_key=eq.${enc(key)}&select=*`))?.[0];
  if (!project) {
    try {
      project = (await sb('/rest/v1/nexora_projects', { method: 'POST', body: { title, brief: clean(b.brief, 6000), approval_mode: mode, idempotency_key: key }, headers: REP }))[0];
    } catch (e) {
      if (e.code === '23505' && key) project = (await sb(`/rest/v1/nexora_projects?idempotency_key=eq.${enc(key)}&select=*`))[0];
      else throw e;
    }
  }
  // Task template memakai idempotency_key per proyek+step → request ulang tidak membuat task ganda.
  const maxRetries = intEnv('NEXORA_MAX_RETRIES', 2, 0, 5);
  const rows = PIPELINE.map((s, i) => ({
    project_id: project.id, title: s.title, agent_name: s.agent, status: s.deps.length ? 'blocked' : 'queued',
    details: s.ask, step_key: s.key, step_order: i, max_retries: maxRetries, requires_approval: !!s.approval,
    idempotency_key: `${project.id}:${s.key}`
  }));
  await sb('/rest/v1/nexora_tasks?on_conflict=idempotency_key', { method: 'POST', body: rows, headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' } });
  const { tasks } = await loadGraph(project.id);
  const idOf = Object.fromEntries(tasks.map(t => [t.step_key, t.id]));
  const depRows = PIPELINE.flatMap(s => s.deps.map(d => ({ task_id: idOf[s.key], depends_on: idOf[d] })));
  if (depRows.length) await sb('/rest/v1/nexora_task_dependencies?on_conflict=task_id,depends_on', { method: 'POST', body: depRows, headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' } });
  await addMessage({ projectId: project.id, sender: 'Septian', recipients: ['Arka'], kind: 'decision', body: `Brief baru: ${title}\n\n${clean(b.brief, 1500)}`, idempotencyKey: `brief:${project.id}` });
  await audit('Septian', 'project_created', `Proyek dibuat: ${title}`, { projectId: project.id, mode });
  return project;
}

async function projectDetail(id) {
  const project = await getProject(id);
  await recoverStale(id);
  const { tasks, deps } = await loadGraph(id);
  const ids = tasks.map(t => t.id);
  const [messages, runs, approvals] = await Promise.all([
    sb(`/rest/v1/nexora_agent_messages?project_id=eq.${enc(id)}&select=*&order=created_at.desc&limit=120`),
    ids.length ? sb(`/rest/v1/nexora_agent_runs?task_id=in.(${ids.join(',')})&select=id,task_id,agent_name,attempt,status,model,error,tokens,started_at,finished_at&order=started_at.desc&limit=150`) : [],
    sb(`/rest/v1/nexora_approvals?project_id=eq.${enc(id)}&select=*&order=created_at.desc&limit=60`)
  ]);
  return { project, tasks, deps, messages: (messages || []).reverse(), runs: runs || [], approvals: approvals || [], maxRevisions: MAX_REVISIONS };
}

async function decideApproval(b) {
  const id = need(b.id, 'ID persetujuan');
  const decision = b.decision === 'approved' ? 'approved' : b.decision === 'rejected' ? 'rejected' : null;
  if (!decision) throw httpError(400, 'Keputusan harus approved atau rejected.');
  const note = clean(b.note, 1000);
  const rows = await sb(`/rest/v1/nexora_approvals?id=eq.${enc(id)}&status=eq.pending`, { method: 'PATCH', body: { status: decision, decided_note: note, decided_at: nowIso() }, headers: REP });
  const approval = rows?.[0];
  if (!approval) throw httpError(409, 'Persetujuan tidak ditemukan atau sudah diputuskan.');
  const task = await getTask(approval.task_id);
  if (decision === 'approved') {
    if (task.status === 'awaiting_approval') await transition(task, 'completed', { finished_at: nowIso() }, 'Septian');
    await addMessage({ projectId: approval.project_id, taskId: task.id, sender: 'Septian', recipients: [task.agent_name], kind: 'decision', body: `Disetujui: ${task.title}.${note ? ' Catatan: ' + note : ''}` });
    await promote(approval.project_id);
  } else {
    const ok = await requestRevision(task, { note: note || 'CEO menolak hasil ini. Mohon perbaiki.', sender: 'Septian', projectId: approval.project_id });
    if (!ok) { await sb(`/rest/v1/nexora_approvals?id=eq.${enc(id)}`, { method: 'PATCH', body: { status: 'pending', decided_note: null, decided_at: null } }); throw httpError(409, `Batas revisi (${MAX_REVISIONS}) tercapai untuk task ini. Setujui atau batalkan proyek.`); }
    await refreshProject(approval.project_id);
  }
  return { ok: true };
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  let b; try { b = await req.json(); } catch { return json(400, { error: 'JSON tidak valid.' }); }
  if (!authorized(b.accessCode)) return json(401, { error: 'Kode akses cloud salah atau belum dikonfigurasi.' });
  try {
    switch (String(b.action || '')) {
      case 'health': {
        await sb('/rest/v1/nexora_projects?select=id&limit=1');
        const ai = aiInfo();
        return json(200, { ok: true, version: '2.0.1', provider: ai.provider, model: ai.model || null, fallbackModel: ai.fallback || null, keyDetected: !!ai.key, dailyLimit: intEnv('NEXORA_DAILY_AI_LIMIT', 40, 1, 5000) });
      }
      case 'project.create': return json(200, { project: await createProject(b) });
      case 'project.list': return json(200, { items: await sb('/rest/v1/nexora_projects?select=*&order=created_at.desc&limit=50') || [] });
      case 'project.get': return json(200, await projectDetail(need(b.id, 'ID proyek')));
      case 'project.cancel': {
        const p = await getProject(b.id);
        await sb(`/rest/v1/nexora_projects?id=eq.${enc(p.id)}`, { method: 'PATCH', body: { status: 'cancelled', updated_at: nowIso() } });
        await audit('Septian', 'project_cancelled', `Proyek dibatalkan: ${p.title}`, { projectId: p.id });
        return json(200, { ok: true });
      }
      case 'run.prepare': return json(200, await prepareRun({ taskId: b.taskId, projectId: b.projectId }));
      case 'task.retry': {
        const t = await getTask(b.id);
        if (t.status !== 'failed') throw httpError(409, 'Hanya task gagal yang bisa dicoba ulang.');
        if (t.retry_count >= t.max_retries) throw httpError(409, `Batas percobaan (${t.max_retries}) tercapai. Alihkan ke Agent lain atau buat ulang.`);
        return json(200, { item: await transition(t, 'queued', { error: null }, 'Septian') });
      }
      case 'task.reassign': {
        const t = await getTask(b.id);
        const agent = AGENT_NAMES.find(n => n === b.agentName && n !== 'Septian');
        if (!agent) throw httpError(400, 'Agent tujuan tidak valid.');
        if (!['failed', 'queued', 'blocked'].includes(t.status)) throw httpError(409, 'Task hanya bisa dialihkan saat gagal, antre, atau menunggu.');
        const rows = await sb(`/rest/v1/nexora_tasks?id=eq.${enc(t.id)}&status=eq.${enc(t.status)}`, { method: 'PATCH', body: { agent_name: agent, status: t.status === 'failed' ? 'queued' : t.status, retry_count: 0, error: null, updated_at: nowIso() }, headers: REP });
        if (!rows?.[0]) throw httpError(409, 'Status task sudah berubah. Muat ulang.');
        await audit('Septian', 'task_reassigned', `${t.title}: ${t.agent_name} → ${agent}`, { taskId: t.id });
        return json(200, { item: rows[0] });
      }
      case 'task.revise': {
        const t = await getTask(b.id);
        if (!['completed', 'awaiting_approval'].includes(t.status)) throw httpError(409, 'Revisi hanya untuk task yang sudah selesai atau menunggu persetujuan.');
        const note = clean(b.note, 1500);
        if (!note) throw httpError(400, 'Tulis catatan revisi.');
        if (!await requestRevision(t, { note, sender: 'Septian', projectId: t.project_id })) throw httpError(409, `Batas revisi (${MAX_REVISIONS}) tercapai.`);
        await sb(`/rest/v1/nexora_approvals?task_id=eq.${enc(t.id)}&status=eq.pending`, { method: 'PATCH', body: { status: 'rejected', decided_note: 'Diganti permintaan revisi.', decided_at: nowIso() } });
        await refreshProject(t.project_id);
        return json(200, { ok: true });
      }
      case 'message.send': {
        const projectId = need(b.projectId, 'ID proyek');
        const sender = AGENT_NAMES.find(n => n === b.sender) || 'Septian';
        const recipients = (Array.isArray(b.recipients) ? b.recipients : []).filter(n => AGENT_NAMES.includes(n));
        const kind = ['note', 'question', 'answer', 'decision'].includes(b.kind) ? b.kind : 'note';
        const taskId = b.taskId ? need(b.taskId, 'ID task') : null;
        const msg = await addMessage({ projectId, taskId, sender, recipients: recipients.length ? recipients : ['Semua'], kind, body: b.body, idempotencyKey: clean(b.idempotencyKey, 100) || null });
        return json(200, { item: msg, duplicate: !msg });
      }
      case 'approval.decide': return json(200, await decideApproval(b));
      case 'agents': return json(200, { agents: AGENTS });
      default: return json(400, { error: 'Action tidak dikenal.' });
    }
  } catch (e) {
    const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 500;
    return json(status, { error: clean(e.message || 'Operasi kolaborasi gagal.', 400) });
  }
};
