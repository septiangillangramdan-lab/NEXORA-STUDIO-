// NEXORA STUDIO — Cloud Center v2.0.2 (dibangun ulang; file asli terkirim kosong).
// Semua akses lewat Netlify Function `cloud-data`. Tidak ada secret/service-role key di browser.
// Kode akses hanya disimpan di sessionStorage (hilang saat tab ditutup); modul lain (AI Brain, Agent Room) membacanya dari sana.
const $ = id => document.getElementById(id);
const KEY = 'nexora_cloud_code';
const ENDPOINT = '/.netlify/functions/cloud-data';
const LIMIT = 200; // batas baris yang dikembalikan cloud-data per daftar
const MAX_FILE = 4 * 1024 * 1024;
const TASK_STATUSES = ['queued', 'working', 'review', 'approved', 'revision', 'completed'];
const data = { memories: [], tasks: [], assets: [], logs: [] };

const getCode = () => { try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; } };
const setCode = v => { try { if (v) sessionStorage.setItem(KEY, v); else sessionStorage.removeItem(KEY); } catch { /* diperiksa saat menghubungkan */ } };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const fmt = v => { try { return v ? new Date(v).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : ''; } catch { return ''; } };
const clip = (v, n) => { const s = String(v ?? ''); return s.length > n ? s.slice(0, n) + '…' : s; };

function note(message, type = 'info') {
  const e = $('cloud-status');
  if (e) { e.textContent = message; e.className = `composer-hint cloud-status ${type}`; }
}
function setState(on) { const p = $('cloud-state-pill'); if (p) p.textContent = on ? 'CONNECTED' : 'OFFLINE'; }

async function call(code, action, payload = {}) {
  let res;
  try {
    res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, accessCode: code, ...payload }) });
  } catch { throw new Error('Tidak dapat menghubungi server. Periksa koneksi internet.'); }
  let body = {};
  try { body = JSON.parse(await res.text()); } catch { /* respons bukan JSON */ }
  if (!res.ok) {
    if (res.status === 404) throw new Error('Function cloud-data tidak ditemukan (404). Pastikan folder netlify/functions ikut ter-deploy.');
    throw new Error(body.error || `Cloud error ${res.status}.`);
  }
  return body;
}
function request(action, payload) {
  const code = getCode();
  if (!code) throw new Error('Hubungkan cloud terlebih dahulu.');
  return call(code, action, payload);
}

// Jalankan aksi tombol: cegah klik ganda dan tampilkan error apa adanya.
async function guarded(button, fn) {
  if (button) { if (button.disabled) return; button.disabled = true; }
  try { await fn(); }
  catch (e) { note(String(e?.message || 'Operasi cloud gagal.'), 'error'); }
  finally { if (button) button.disabled = false; }
}

// ---------- Render ----------
function empty(list, text) { list.replaceChildren(el('div', 'empty-timeline', text)); }
function count(id, n) { const e = $(id); if (e) e.textContent = n >= LIMIT ? `${LIMIT}+` : String(n); }
function button(label, onClick) { const b = el('button', 'secondary-button', label); b.type = 'button'; b.addEventListener('click', () => guarded(b, onClick)); return b; }

function renderMemories() {
  const list = $('cloud-memory-list'); if (!list) return;
  count('cloud-memory-count', data.memories.length);
  if (!data.memories.length) return empty(list, 'Belum ada memori cloud.');
  list.replaceChildren(...data.memories.map(m => {
    const c = el('article', 'cloud-record');
    c.append(el('b', '', m.title || '(tanpa judul)'), el('small', '', [m.agent_name, m.category, fmt(m.created_at)].filter(Boolean).join(' · ')), el('p', '', clip(m.body, 700)));
    const act = el('div', 'cloud-record-actions');
    act.append(button('Hapus', async () => { if (!confirm('Hapus memori ini dari cloud?')) return; await request('memory.delete', { id: m.id }); await reload('memory'); note('Memori dihapus.', 'success'); }));
    c.append(act); return c;
  }));
}
function renderTasks() {
  const list = $('cloud-task-list'); if (!list) return;
  count('cloud-task-count', data.tasks.length);
  if (!data.tasks.length) return empty(list, 'Belum ada tugas cloud.');
  list.replaceChildren(...data.tasks.map(t => {
    const c = el('article', 'cloud-record');
    c.append(el('b', '', t.title || '(tanpa judul)'), el('small', '', [t.agent_name, t.status, fmt(t.created_at)].filter(Boolean).join(' · ')));
    if (t.details) c.append(el('p', '', clip(t.details, 500)));
    const act = el('div', 'cloud-record-actions');
    if (t.project_id) {
      // Task milik proyek Agent Room memakai status/dependensi sendiri; jangan diubah dari sini.
      act.append(el('small', '', 'Dikelola oleh Agent Room.'));
    } else {
      const sel = el('select', 'style-input');
      TASK_STATUSES.forEach(s => sel.add(new Option(s, s, false, s === t.status)));
      sel.addEventListener('change', () => guarded(sel, async () => { await request('task.update', { id: t.id, status: sel.value }); await reload('task'); note('Status tugas diperbarui.', 'success'); }));
      act.append(sel, button('Hapus', async () => { if (!confirm('Hapus tugas ini dari cloud?')) return; await request('task.delete', { id: t.id }); await reload('task'); note('Tugas dihapus.', 'success'); }));
    }
    c.append(act); return c;
  }));
}
function renderAssets() {
  const list = $('cloud-asset-list'); if (!list) return;
  count('cloud-asset-count', data.assets.length);
  if (!data.assets.length) return empty(list, 'Belum ada aset cloud.');
  list.replaceChildren(...data.assets.map(a => {
    const c = el('article', 'cloud-record');
    const kb = Number(a.size_bytes) ? `${(Number(a.size_bytes) / 1024).toFixed(1)} KB` : '';
    c.append(el('b', '', a.name || '(tanpa nama)'), el('small', '', [a.mime_type, kb, fmt(a.created_at)].filter(Boolean).join(' · ')));
    const act = el('div', 'cloud-record-actions');
    act.append(button('Unduh', async () => {
      const r = await request('asset.download', { id: a.id });
      if (!r.url) throw new Error('Tautan unduh tidak tersedia.');
      const link = el('a'); link.href = r.url; link.target = '_blank'; link.rel = 'noopener'; link.download = r.name || a.name || 'asset';
      document.body.append(link); link.click(); link.remove();
    }), button('Hapus', async () => { if (!confirm('Hapus aset ini dari cloud?')) return; await request('asset.delete', { id: a.id }); await reload('asset'); note('Aset dihapus.', 'success'); }));
    c.append(act); return c;
  }));
}
function renderLogs() {
  const list = $('cloud-log-list'); if (!list) return;
  count('cloud-log-count', data.logs.length);
  if (!data.logs.length) return empty(list, 'Belum ada activity log.');
  list.replaceChildren(...data.logs.map(l => {
    const c = el('article', 'cloud-record compact');
    c.append(el('b', '', [l.agent_name, l.event_type].filter(Boolean).join(' · ')), el('p', '', clip(l.message, 400)), el('small', '', fmt(l.created_at)));
    return c;
  }));
}
const RENDER = { memory: renderMemories, task: renderTasks, asset: renderAssets, log: renderLogs };
const FIELD = { memory: 'memories', task: 'tasks', asset: 'assets', log: 'logs' };

function clearAll() {
  Object.keys(data).forEach(k => { data[k] = []; });
  ['cloud-memory-count', 'cloud-task-count', 'cloud-asset-count', 'cloud-log-count'].forEach(id => { const e = $(id); if (e) e.textContent = '—'; });
  [['cloud-memory-list'], ['cloud-task-list'], ['cloud-asset-list'], ['cloud-log-list']].forEach(([id]) => { const l = $(id); if (l) empty(l, 'Hubungkan cloud untuk memuat data.'); });
}

async function reload(kind) {
  const r = await request(`${kind}.list`);
  data[FIELD[kind]] = Array.isArray(r.items) ? r.items : [];
  RENDER[kind]();
}
// Mengembalikan daftar jenis data yang gagal dimuat (kosong = semua berhasil).
async function loadAll() {
  const kinds = Object.keys(RENDER);
  const results = await Promise.allSettled(kinds.map(k => reload(k)));
  const failed = []; let firstError = '';
  results.forEach((r, i) => { if (r.status === 'rejected') { failed.push(kinds[i]); firstError ||= String(r.reason?.message || ''); } });
  return { failed, firstError };
}

// ---------- Aksi ----------
function onConnect() {
  return guarded($('cloud-connect'), async () => {
    const code = ($('cloud-access-code')?.value || '').trim();
    if (!code) throw new Error('Masukkan kode akses cloud terlebih dahulu.');
    note('Menghubungkan ke Supabase…');
    const h = await call(code, 'health');
    if (!h.ok) throw new Error('Respons server tidak dikenali. Pastikan Function cloud-data ter-deploy.');
    setCode(code);
    if (getCode() !== code) throw new Error('Browser menolak penyimpanan sesi (mode privat?). Cloud tidak dapat dipakai pada tab ini.');
    setState(true);
    const { failed, firstError } = await loadAll();
    if (failed.length) note(`Terhubung, tetapi gagal memuat: ${failed.join(', ')}. ${firstError}`.trim(), 'error');
    else note('Terhubung. Data cloud berhasil dimuat.', 'success');
  });
}
function onDisconnect() {
  setCode(''); const i = $('cloud-access-code'); if (i) i.value = '';
  setState(false); clearAll(); note('Cloud diputuskan. Kode akses dihapus dari tab ini.', 'info');
}
const val = id => ($('' + id)?.value || '').trim();
const clear = (...ids) => ids.forEach(id => { const e = $(id); if (e) e.value = ''; });

function saveMemory() {
  return guarded($('cloud-memory-save'), async () => {
    const title = val('cloud-memory-title'), body = val('cloud-memory-body');
    if (!title || !body) throw new Error('Judul dan isi memori wajib diisi.');
    await request('memory.save', { agentName: val('cloud-memory-agent'), category: val('cloud-memory-category'), title, body });
    clear('cloud-memory-title', 'cloud-memory-body'); await reload('memory'); note('Memori cloud tersimpan.', 'success');
  });
}
function saveTask() {
  return guarded($('cloud-task-save'), async () => {
    const title = val('cloud-task-title');
    if (!title) throw new Error('Nama tugas wajib diisi.');
    await request('task.save', { title, agentName: val('cloud-task-agent'), details: val('cloud-task-details'), status: 'queued' });
    clear('cloud-task-title', 'cloud-task-details'); await reload('task'); note('Tugas cloud ditambahkan.', 'success');
  });
}
function addLog() {
  return guarded($('cloud-log-add'), async () => {
    const message = val('cloud-log-message');
    if (!message) throw new Error('Isi activity log wajib diisi.');
    await request('log.add', { agentName: 'Septian', eventType: 'manual', message });
    clear('cloud-log-message'); await reload('log'); note('Activity log ditambahkan.', 'success');
  });
}
function readBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('File tidak dapat dibaca.'));
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.readAsDataURL(file);
  });
}
function uploadAsset() {
  return guarded($('cloud-asset-upload'), async () => {
    const file = $('cloud-asset-file')?.files?.[0];
    if (!file) throw new Error('Pilih file terlebih dahulu.');
    if (file.size > MAX_FILE) throw new Error('Ukuran file maksimum 4 MB.');
    note('Mengunggah…');
    await request('asset.upload', { name: file.name, mime: file.type || 'application/octet-stream', base64: await readBase64(file) });
    const input = $('cloud-asset-file'); if (input) input.value = '';
    await reload('asset'); note('Aset terunggah.', 'success');
  });
}
function refreshAll() {
  return guarded($('cloud-refresh'), async () => {
    if (!getCode()) throw new Error('Hubungkan cloud terlebih dahulu.');
    note('Menyinkronkan…');
    const { failed, firstError } = await loadAll();
    if (failed.length) note(`Gagal memuat: ${failed.join(', ')}. ${firstError}`.trim(), 'error'); else note('Semua data cloud berhasil disinkronkan.', 'success');
  });
}
function backup() {
  return guarded($('cloud-backup'), async () => {
    if (!getCode()) throw new Error('Hubungkan cloud terlebih dahulu.');
    const { failed, firstError } = await loadAll();
    if (failed.length) throw new Error(`Backup dibatalkan karena gagal memuat: ${failed.join(', ')}. ${firstError}`.trim());
    const blob = new Blob([JSON.stringify({ app: 'NEXORA STUDIO', version: '2.0.2', exportedAt: new Date().toISOString(), ...data }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a'); a.href = url; a.download = `nexora-cloud-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
    note('Backup JSON diunduh ke perangkat.', 'success');
  });
}

$('cloud-connect')?.addEventListener('click', onConnect);
$('cloud-disconnect')?.addEventListener('click', onDisconnect);
$('cloud-memory-save')?.addEventListener('click', saveMemory);
$('cloud-task-save')?.addEventListener('click', saveTask);
$('cloud-log-add')?.addEventListener('click', addLog);
$('cloud-asset-upload')?.addEventListener('click', uploadAsset);
$('cloud-refresh')?.addEventListener('click', refreshAll);
$('cloud-backup')?.addEventListener('click', backup);
$('cloud-access-code')?.addEventListener('keydown', e => { if (e.key === 'Enter') onConnect(); });

// Pulihkan sesi bila tab masih menyimpan kode akses (mis. setelah pindah menu atau muat ulang halaman).
if (getCode()) {
  setState(true); note('Memulihkan sesi cloud…');
  loadAll().then(({ failed, firstError }) => {
    if (failed.length && /salah|belum dikonfigurasi/i.test(firstError)) { setCode(''); setState(false); clearAll(); note('Kode akses sesi sebelumnya tidak valid. Hubungkan ulang.', 'error'); }
    else if (failed.length) note(`Sesi dipulihkan, tetapi gagal memuat: ${failed.join(', ')}. ${firstError}`.trim(), 'error');
    else note('Sesi cloud dipulihkan. Data berhasil dimuat.', 'success');
  });
}
