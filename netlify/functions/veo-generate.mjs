import { randomUUID } from 'node:crypto';
import { getServiceAccount, getProjectId, getBucket, getAccessToken, verifyVideoAccessCode, json } from './lib/google-cloud.mjs';

const MODEL = 'gemini-omni-1.2-flash';
const RATIOS = new Set(['16:9', '9:16']);
const DURATIONS = new Set([5, 8, 10, 12, 15]);

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  try {
    const body = await req.json();
    if (!verifyVideoAccessCode(body?.accessCode)) return json(403, { error: 'Kode akses AI Video Lab tidak cocok.' });
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) return json(400, { error: 'Prompt video wajib diisi.' });
    if (prompt.length > 1800) return json(413, { error: 'Prompt maksimum 1.800 karakter.' });
    const ratio = RATIOS.has(body.ratio) ? body.ratio : '9:16';
    const duration = DURATIONS.has(Number(body.duration)) ? Number(body.duration) : 5;
    const imageUri = typeof body.imageUri === 'string' && /^gs:\/\/[a-z0-9._-]+\/[a-zA-Z0-9_./-]+$/.test(body.imageUri) ? body.imageUri : '';
    const imageMime = ['image/png', 'image/jpeg', 'image/webp'].includes(body.imageMime) ? body.imageMime : 'image/png';
    const account = getServiceAccount();
    const project = getProjectId(account);
    const bucket = getBucket();
    const token = await getAccessToken(account);
    const jobId = randomUUID();
    const outputUri = `gs://${bucket}/nexora-output/${jobId}/`;
    const content = [{ type: 'text', text: `${duration}-second ${ratio} video. ${prompt}${imageUri ? ' Use the supplied image as the first frame and preserve its key subject design.' : ''}` }];
    if (imageUri) content.push({ type: 'image', uri: imageUri, mime_type: imageMime });
    const payload = {
      model: MODEL,
      background: true,
      store: true,
      input: [{ type: 'user_input', content }],
      response_format: [{ type: 'video', delivery: 'uri', gcs_uri: outputUri, aspect_ratio: ratio, resolution: '720p', duration: `${duration}s` }],
      generation_config: { video_config: { task: imageUri ? 'image_to_video' : 'text_to_video' } }
    };
    const response = await fetch(`https://aiplatform.googleapis.com/v1beta1/projects/${encodeURIComponent(project)}/locations/global/interactions`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return json(response.status === 429 ? 429 : 502, { error: data?.error?.message || `Google Video API mengembalikan status ${response.status}.` });
    if (!data.id) return json(502, { error: 'Provider tidak mengembalikan interaction ID.' });
    return json(200, { jobId, interactionId: data.id, status: data.status || 'in_progress', model: MODEL, ratio, duration, mode: imageUri ? 'image-to-video' : 'text-to-video' });
  } catch (error) {
    return json(503, { error: error.message || 'Tidak dapat memulai generasi video.' });
  }
};
