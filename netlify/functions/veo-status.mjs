import { getServiceAccount, getProjectId, getBucket, getAccessToken, signStorageUrl, verifyVideoAccessCode, json } from './lib/google-cloud.mjs';

function findVideoUri(data) {
  for (const step of data?.steps || []) {
    for (const item of step?.content || []) if (item?.type === 'video' && item?.uri) return item.uri;
  }
  for (const item of data?.response?.generatedVideos || []) if (item?.video?.uri) return item.video.uri;
  return '';
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  try {
    const body = await req.json();
    if (!verifyVideoAccessCode(body?.accessCode)) return json(403, { error: 'Kode akses AI Video Lab tidak cocok.' });
    const id = String(body?.interactionId || '');
    if (!/^[A-Za-z0-9_-]{6,160}$/.test(id)) return json(400, { error: 'Interaction ID tidak valid.' });
    const account = getServiceAccount();
    const project = getProjectId(account);
    const token = await getAccessToken(account);
    const response = await fetch(`https://aiplatform.googleapis.com/v1beta1/projects/${encodeURIComponent(project)}/locations/global/interactions/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return json(response.status === 404 ? 404 : 502, { error: data?.error?.message || `Gagal memeriksa pekerjaan (${response.status}).` });
    const status = String(data.status || 'unknown').toLowerCase();
    const uri = findVideoUri(data);
    if (status === 'completed' && uri) {
      const match = uri.match(/^gs:\/\/([^/]+)\/(.+)$/);
      if (!match || match[1] !== getBucket()) return json(502, { error: 'Video selesai tetapi lokasi file tidak cocok dengan bucket NEXORA.' });
      const downloadUrl = await signStorageUrl({ account, bucket: match[1], object: match[2], method: 'GET', expiresSeconds: 900 });
      return json(200, { status: 'completed', videoUri: uri, downloadUrl, mimeType: 'video/mp4', expiresIn: 900, model: data.model || 'gemini-omni-1.2-flash' });
    }
    if (status === 'failed' || data.error) return json(200, { status: 'failed', error: data.error?.message || 'Provider gagal menyelesaikan video.' });
    if (status === 'completed' && !uri) return json(200, { status: 'failed', error: 'Provider menyatakan selesai, tetapi lokasi file video tidak ditemukan.' });
    return json(200, { status: status === 'completed' ? 'processing' : status, message: 'Video masih diproses oleh Google Cloud.' });
  } catch (error) {
    return json(503, { error: error.message || 'Tidak dapat memeriksa status video.' });
  }
};
