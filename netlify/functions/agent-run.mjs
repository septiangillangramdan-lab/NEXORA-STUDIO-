// NEXORA STUDIO v2.0.0 — mode "Langsung": menjalankan Agent dan menunggu hasilnya dalam satu request.
// Batas waktu Netlify untuk function sinkron bisa pendek (default 10 detik), jadi timeout model dibuat singkat.
import { json, authorized, clean, intEnv } from './lib/nexora.mjs';
import { finishRun } from './lib/runner.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  let b; try { b = await req.json(); } catch { return json(400, { error: 'JSON tidak valid.' }); }
  if (!authorized(b.accessCode)) return json(401, { error: 'Kode akses cloud salah atau belum dikonfigurasi.' });
  try {
    const result = await finishRun(String(b.runId || ''), { timeoutMs: intEnv('NEXORA_SYNC_TIMEOUT_MS', 8500, 3000, 25000) });
    return json(200, result);
  } catch (e) {
    return json(e.status || 500, { error: clean(e.message || 'Eksekusi gagal.', 400) });
  }
};
