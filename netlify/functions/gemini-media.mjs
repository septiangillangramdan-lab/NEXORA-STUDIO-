const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
const MODEL = 'gemini-3.1-flash-image';
export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return json(503, { error: 'GEMINI_API_KEY belum diatur pada Environment Variables Netlify.' });
  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Format permintaan tidak valid.' }); }
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) return json(400, { error: 'Prompt gambar wajib diisi.' });
  if (prompt.length > 4500) return json(413, { error: 'Prompt terlalu panjang (maksimum 4.500 karakter).' });
  const ratio = ['9:16', '16:9', '1:1'].includes(body.ratio) ? body.ratio : '9:16';
  const style = String(body.style || '2D cinematic animation').slice(0, 80);
  const negative = String(body.negative || '').slice(0, 500);
  const fullPrompt = `Create one original high-quality image for a short-form animated story. Visual style: ${style}. Composition/aspect ratio: ${ratio}. Prompt: ${prompt}. ${negative ? `Avoid: ${negative}.` : ''} Do not add captions, logos, signatures, or watermarks. Keep the composition clear and suitable for use as a video scene.`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55000);
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ model: MODEL, input: fullPrompt })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.error?.message || `Gemini API mengembalikan status ${response.status}.`;
      return json(response.status === 429 ? 429 : 502, { error: message.slice(0, 500) });
    }
    let image = null;
    for (const step of (data.steps || [])) {
      for (const item of (step.content || [])) {
        if (item.type === 'image' && item.data) { image = { data: item.data, mimeType: item.mime_type || 'image/png' }; break; }
      }
      if (image) break;
    }
    if (!image) return json(502, { error: 'Model tidak mengembalikan file gambar. Coba prompt lain atau periksa dukungan model pada akun.' });
    return json(200, { image, model: MODEL, interactionId: data.id || null });
  } catch (error) {
    return json(504, { error: error.name === 'AbortError' ? 'Waktu generasi gambar habis. Coba prompt lebih singkat.' : 'Tidak dapat menghubungi Gemini Image API.' });
  } finally { clearTimeout(timer); }
};
