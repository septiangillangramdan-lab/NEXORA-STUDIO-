const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body)
});

const ALLOWED_MODELS = new Set(['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts']);
const VOICES = new Set(['Zephyr','Puck','Charon','Kore','Fenrir','Leda','Orus','Aoede','Callirrhoe','Autonoe','Enceladus','Iapetus','Umbriel','Algieba','Despina','Erinome','Algenib','Rasalgethi','Laomedeia','Achernar','Alnilam','Schedar','Gacrux','Pulcherrima','Achird','Zubenelgenubi','Vindemiatrix','Sadachbia','Sadaltager','Sulafat']);

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return json(503, { error: 'GEMINI_API_KEY belum diatur pada Environment Variables Netlify.' });
  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Format permintaan tidak valid.' }); }

  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text) return json(400, { error: 'Teks narasi wajib diisi.' });
  if (text.length > 3500) return json(413, { error: 'Maksimum 3.500 karakter per generasi. Bagi naskah menjadi beberapa bagian.' });
  const voice = VOICES.has(body.voice) ? body.voice : 'Kore';
  const requestedModel = String(body.model || 'gemini-3.8-flash-lite-tts');
  const MODEL = ALLOWED_MODELS.has(requestedModel) ? requestedModel : 'gemini-3.8-flash-lite-tts';
  const style = String(body.style || 'Narasi bahasa Indonesia yang jelas, natural, hangat, dan artikulatif.').slice(0, 300);
  const language = String(body.language || 'Indonesian').slice(0, 40);
  const prompt = `Read the following text verbatim in ${language}. Delivery direction: ${style}. Do not translate, summarize, add words, or omit any part. Text to speak:\n\n${text}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } }
        }
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.error?.message || `Gemini TTS mengembalikan status ${response.status}.`;
      return json(response.status === 429 ? 429 : 502, { error: message.slice(0, 500) });
    }
    const parts = data?.candidates?.flatMap(c => c?.content?.parts || []) || [];
    const audioPart = parts.find(p => p?.inlineData?.data || p?.inline_data?.data);
    const inline = audioPart?.inlineData || audioPart?.inline_data;
    if (!inline?.data) return json(502, { error: 'Model tidak mengembalikan audio. Coba naskah lebih singkat atau periksa akses model dan kuota.' });
    return json(200, {
      audio: { data: inline.data, mimeType: inline.mimeType || inline.mime_type || 'audio/wav' },
      model: MODEL,
      voice,
      finishReason: data?.candidates?.[0]?.finishReason || null
    });
  } catch (error) {
    return json(504, { error: error.name === 'AbortError' ? 'Generasi suara melewati batas waktu. Coba naskah lebih singkat.' : 'Tidak dapat menghubungi Gemini TTS.' });
  } finally { clearTimeout(timer); }
};
