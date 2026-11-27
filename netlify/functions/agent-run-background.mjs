// NEXORA STUDIO v2.0.0 — mode "Background": Netlify langsung membalas 202, proses berjalan sampai 15 menit.
// Nama file berakhiran -background sehingga di-deploy sebagai Background Function.
// Jangan pernah melempar error di sini: Netlify akan mengulang pemanggilan yang error.
import { authorized, intEnv } from './lib/nexora.mjs';
import { finishRun } from './lib/runner.mjs';

export default async (req) => {
  try {
    const b = await req.json();
    if (!authorized(b.accessCode)) return;
    await finishRun(String(b.runId || ''), { timeoutMs: intEnv('NEXORA_BG_TIMEOUT_MS', 90000, 10000, 300000) });
  } catch { /* status task akan ditandai kedaluwarsa oleh recoverStale bila proses mati */ }
};
