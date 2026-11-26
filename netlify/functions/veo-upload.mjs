import { randomUUID } from 'node:crypto';
import { getServiceAccount, getBucket, signStorageUrl, verifyVideoAccessCode, json } from './lib/google-cloud.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  try {
    const body = await req.json();
    if (!verifyVideoAccessCode(body?.accessCode)) return json(403, { error: 'Kode akses AI Video Lab tidak cocok.' });
    const mime = String(body?.mimeType || '');
    const allowed = new Set(['image/png', 'image/jpeg', 'image/webp']);
    if (!allowed.has(mime)) return json(400, { error: 'Format gambar harus PNG, JPEG, atau WebP.' });
    const account = getServiceAccount();
    const bucket = getBucket();
    const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
    const object = `nexora-input/${randomUUID()}.${ext}`;
    const uploadUrl = await signStorageUrl({ account, bucket, object, method: 'PUT', contentType: mime, expiresSeconds: 900 });
    return json(200, { uploadUrl, imageUri: `gs://${bucket}/${object}`, mimeType: mime, expiresIn: 900 });
  } catch (error) {
    return json(503, { error: error.message || 'Tidak dapat menyiapkan upload gambar.' });
  }
};
