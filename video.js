const $ = (id) => document.getElementById(id);
let referenceFile = null;
let referencePreviewUrl = null;
let activeInteractionId = null;
let pollTimer = null;
let currentDownloadUrl = null;
let currentVideoUrl = null;

function status(message, mode = 'idle') {
  const box = $('video-job-status');
  if (!box) return;
  box.className = `video-job-status ${mode}`;
  box.replaceChildren();
  const dot = document.createElement('span'); dot.className = 'video-status-dot';
  const text = document.createElement('span'); text.textContent = message;
  box.append(dot, text);
}

function stopPolling() { if (pollTimer) clearTimeout(pollTimer); pollTimer = null; }
function setBusy(busy) {
  $('video-generate').disabled = busy;
  $('video-generate').textContent = busy ? '◌ Mengirim…' : '✦ Generate AI Video';
  $('video-check').disabled = !activeInteractionId;
}

$('video-reference')?.addEventListener('change', (event) => {
  referenceFile = event.target.files?.[0] || null;
  if (referencePreviewUrl) URL.revokeObjectURL(referencePreviewUrl);
  referencePreviewUrl = null;
  const box = $('video-reference-preview');
  if (!referenceFile) {
    box.innerHTML = '<span>▧</span><small>Belum ada gambar referensi</small>';
    return;
  }
  if (referenceFile.size > 8 * 1024 * 1024) {
    referenceFile = null; event.target.value = '';
    box.innerHTML = '<small>Ukuran gambar maksimal 8 MB.</small>';
    status('Gambar terlalu besar. Pilih gambar maksimal 8 MB.', 'error');
    return;
  }
  referencePreviewUrl = URL.createObjectURL(referenceFile);
  const img = document.createElement('img'); img.src = referencePreviewUrl; img.alt = 'Referensi frame pertama';
  const caption = document.createElement('small'); caption.textContent = `${referenceFile.name} · ${Math.round(referenceFile.size / 1024)} KB`;
  box.replaceChildren(img, caption);
});

async function uploadReference(file) {
  status('Menyiapkan unggahan gambar referensi ke Cloud Storage…', 'working');
  const prep = await fetch('/.netlify/functions/veo-upload', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mimeType: file.type, accessCode: $('video-access-code').value.trim() })
  });
  const info = await prep.json().catch(() => ({}));
  if (!prep.ok) throw new Error(info.error || `Upload setup gagal (${prep.status}).`);
  const upload = await fetch(info.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
  if (!upload.ok) throw new Error(`Unggah gambar ke Cloud Storage gagal (${upload.status}). Periksa CORS bucket dan izin service account.`);
  return { imageUri: info.imageUri, imageMime: file.type };
}

async function startGeneration() {
  const prompt = $('video-prompt').value.trim();
  if (!$('video-access-code').value.trim()) { status('Masukkan kode akses AI Video Lab terlebih dahulu.', 'error'); return; }
  if (!prompt) { status('Tulis prompt adegan terlebih dahulu.', 'error'); return; }
  stopPolling();
  setBusy(true);
  $('video-output-state').textContent = 'SUBMITTING';
  $('video-check').disabled = true;
  $('video-output-wrap').innerHTML = '<div class="media-placeholder"><span>◌</span><b>Menyiapkan generasi video…</b><small>Harap tunggu, jangan tutup halaman.</small></div>';
  try {
    let reference = {};
    if (referenceFile) reference = await uploadReference(referenceFile);
    status('Mengirim permintaan ke Gemini Omni. Pekerjaan akan berjalan di cloud.', 'working');
    const response = await fetch('/.netlify/functions/veo-generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, ratio: $('video-ratio').value, duration: Number($('video-duration').value), accessCode: $('video-access-code').value.trim(), ...reference })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Permintaan gagal (${response.status}).`);
    activeInteractionId = data.interactionId;
    localStorage.setItem('nexora_video_active_job', JSON.stringify({ interactionId: activeInteractionId, createdAt: new Date().toISOString(), prompt }));
    $('video-output-state').textContent = 'PROCESSING';
    $('video-check').disabled = false;
    status(`Pekerjaan diterima · ${data.mode === 'image-to-video' ? 'Image-to-video' : 'Text-to-video'} · ${data.duration} detik. Memeriksa status otomatis setiap 18 detik.`, 'working');
    setBusy(false);
    pollStatus();
  } catch (error) {
    $('video-output-state').textContent = 'FAILED';
    status(`Gagal: ${error.message}`, 'error');
    setBusy(false);
  }
}

async function pollStatus() {
  if (!activeInteractionId) return;
  stopPolling();
  $('video-check').disabled = true;
  try {
    const response = await fetch('/.netlify/functions/veo-status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ interactionId: activeInteractionId, accessCode: $('video-access-code').value.trim() })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Pemeriksaan status gagal (${response.status}).`);
    if (data.status === 'completed' && data.downloadUrl) {
      currentDownloadUrl = data.downloadUrl;
      if (currentVideoUrl) URL.revokeObjectURL(currentVideoUrl);
      const video = document.createElement('video');
      video.src = currentDownloadUrl; video.controls = true; video.playsInline = true; video.preload = 'metadata';
      $('video-output-wrap').replaceChildren(video);
      const link = $('video-download'); link.href = currentDownloadUrl; link.classList.remove('disabled'); link.setAttribute('aria-disabled', 'false'); link.download = `nexora-ai-video-${Date.now()}.mp4`;
      $('video-output-state').textContent = 'VIDEO READY';
      $('video-output-note').textContent = 'Video MP4 selesai. Tautan unduh berlaku 15 menit; jika kedaluwarsa, periksa status lagi untuk membuat tautan baru.';
      status('Video selesai dibuat dan siap dipratinjau atau diunduh.', 'success');
      activeInteractionId = null; localStorage.removeItem('nexora_video_active_job');
      $('video-check').disabled = true;
      return;
    }
    if (data.status === 'failed') {
      $('video-output-state').textContent = 'FAILED';
      status(data.error || 'Generasi video gagal.', 'error');
      activeInteractionId = null; localStorage.removeItem('nexora_video_active_job');
      $('video-check').disabled = true;
      return;
    }
    status('Google Cloud masih memproses video. Pemeriksaan berikutnya dalam 18 detik.', 'working');
    $('video-check').disabled = false;
    pollTimer = setTimeout(pollStatus, 18000);
  } catch (error) {
    status(`${error.message} Kamu dapat menekan Periksa status untuk mencoba lagi.`, 'error');
    $('video-check').disabled = false;
  }
}

$('video-generate')?.addEventListener('click', startGeneration);
$('video-check')?.addEventListener('click', pollStatus);

try {
  const saved = JSON.parse(localStorage.getItem('nexora_video_active_job') || 'null');
  if (saved?.interactionId) {
    activeInteractionId = saved.interactionId;
    $('video-output-state').textContent = 'PROCESSING';
    $('video-check').disabled = false;
    status('Ada pekerjaan video sebelumnya. Tekan Periksa status untuk melanjutkan pemantauan.', 'working');
  }
} catch { /* Ignore invalid local job state. */ }
