import { createSign, timingSafeEqual } from 'node:crypto';

const b64url = (value) => Buffer.from(value).toString('base64url');


export function verifyVideoAccessCode(value) {
  const expected = process.env.NEXORA_VIDEO_ACCESS_CODE;
  if (!expected) throw new Error('NEXORA_VIDEO_ACCESS_CODE belum diatur. Aktifkan kode akses video di Netlify sebelum membuka AI Video Lab.');
  const supplied = Buffer.from(String(value || ''));
  const target = Buffer.from(expected);
  return supplied.length === target.length && timingSafeEqual(supplied, target);
}

export function getServiceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON belum diatur di Netlify.');
  let account;
  try { account = JSON.parse(raw); } catch { throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON bukan JSON yang valid.'); }
  if (!account.client_email || !account.private_key) throw new Error('Service account harus memiliki client_email dan private_key.');
  return { ...account, private_key: account.private_key.replace(/\\n/g, '\n') };
}

export function getProjectId(account) {
  const project = process.env.GOOGLE_CLOUD_PROJECT || account.project_id;
  if (!project) throw new Error('GOOGLE_CLOUD_PROJECT belum diatur.');
  return project;
}

export function getBucket() {
  const bucket = process.env.VEO_BUCKET;
  if (!bucket) throw new Error('VEO_BUCKET belum diatur di Netlify.');
  return bucket;
}

export async function getAccessToken(account) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/devstorage.read_write',
    aud: account.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }));
  const unsigned = `${header}.${claim}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(account.private_key, 'base64url')}`;
  const response = await fetch(account.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(data.error_description || data.error || 'Gagal mendapatkan Google Cloud access token.');
  return data.access_token;
}

function encodeObjectPath(object) {
  return object.split('/').map(part => encodeURIComponent(part)).join('/');
}

export async function signStorageUrl({ account, bucket, object, method = 'GET', contentType = '', expiresSeconds = 900 }) {
  const host = 'storage.googleapis.com';
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const day = stamp.slice(0, 8);
  const scope = `${day}/auto/storage/goog4_request`;
  const credential = `${account.client_email}/${scope}`;
  const signedHeaders = contentType ? 'content-type;host' : 'host';
  const canonicalHeaders = contentType ? `content-type:${contentType}\nhost:${host}\n` : `host:${host}\n`;
  const query = new URLSearchParams({
    'X-Goog-Algorithm': 'GOOG4-RSA-SHA256',
    'X-Goog-Credential': credential,
    'X-Goog-Date': stamp,
    'X-Goog-Expires': String(expiresSeconds),
    'X-Goog-SignedHeaders': signedHeaders
  });
  const canonicalQuery = [...query.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const canonicalRequest = [method, `/${bucket}/${encodeObjectPath(object)}`, canonicalQuery, canonicalHeaders, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n');
  const crypto = await import('node:crypto');
  const hash = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
  const stringToSign = ['GOOG4-RSA-SHA256', stamp, scope, hash].join('\n');
  const signer = createSign('RSA-SHA256');
  signer.update(stringToSign);
  signer.end();
  const signature = signer.sign(account.private_key, 'hex');
  return `https://${host}/${bucket}/${encodeObjectPath(object)}?${canonicalQuery}&X-Goog-Signature=${signature}`;
}

export function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}
