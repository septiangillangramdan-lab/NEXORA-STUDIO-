const MODEL_ALLOWLIST = new Set(['gemini-2.5-flash']);
const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return json(503, { error: 'GEMINI_API_KEY belum diatur pada Environment Variables Netlify.' });
  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Format permintaan tidak valid.' }); }
  if (body?.action === 'health') return json(200, { ok: true, message: 'Server siap dan API key terdeteksi. Koneksi model diuji saat Agent dijalankan.' });
  if (body?.action !== 'generate') return json(400, { error: 'Action tidak dikenal.' });
  const model = MODEL_ALLOWLIST.has(body.model) ? body.model : 'gemini-2.5-flash';
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) return json(400, { error: 'Instruksi tugas kosong.' });
  if (prompt.length > 12000) return json(413, { error: 'Instruksi terlalu panjang (maksimum 12.000 karakter).' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55000);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 4096 } })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.error?.message || `Gemini API mengembalikan status ${response.status}.`;
      return json(response.status === 429 ? 429 : 502, { error: message.slice(0, 500) });
    }
    const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('\n').trim();
    if (!text) return json(502, { error: 'Model tidak memberikan teks. Respons mungkin dibatasi oleh filter keamanan.' });
    return json(200, { text, model, usage: data.usageMetadata || null });
  } catch (error) {
    return json(504, { error: error.name === 'AbortError' ? 'Waktu tunggu model habis. Coba tugas yang lebih singkat.' : 'Tidak dapat menghubungi Gemini API.' });
  } finally { clearTimeout(timer); }
};
