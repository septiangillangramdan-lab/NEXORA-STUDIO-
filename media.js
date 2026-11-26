// NEXORA STUDIO v1.2.0 — AI Media Lab (image generation)
const $ = id => document.getElementById(id);
const DB_NAME='nexora_creative_v110', STORE='assets';
let currentBlob=null, currentUrl=null, currentAssetId=null;
function openAssetDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function saveAsset(blob,name){const db=await openAssetDB();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');const req=tx.objectStore(STORE).add({name,type:blob.type||'image/png',size:blob.size,blob,addedAt:new Date().toISOString(),source:'AI Media Lab'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close();tx.onerror=()=>reject(tx.error);});}
function setStatus(text){$('media-status').textContent=text;}
function base64ToBlob(base64,mime){const raw=atob(base64),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return new Blob([bytes],{type:mime});}
async function generateImage(){
 const prompt=$('media-prompt').value.trim();if(!prompt){setStatus('Isi prompt gambar terlebih dahulu.');return;}
 const button=$('media-generate');button.disabled=true;button.textContent='◌ Generating…';setStatus('Mengirim prompt ke model gambar Gemini. Proses dapat memerlukan waktu.');$('media-output-state').textContent='GENERATING';
 try{
  const response=await fetch('/.netlify/functions/gemini-media',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt,style:$('media-style').value,ratio:$('media-ratio').value,negative:$('media-negative').value})});
  const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`Server error (${response.status})`);
  currentBlob=base64ToBlob(data.image.data,data.image.mimeType||'image/png');if(currentUrl)URL.revokeObjectURL(currentUrl);currentUrl=URL.createObjectURL(currentBlob);currentAssetId=null;
  const img=document.createElement('img');img.src=currentUrl;img.alt='Gambar hasil generasi AI NEXORA';$('media-preview').replaceChildren(img);$('media-output-state').textContent='IMAGE READY';$('media-download').disabled=false;$('media-send-composer').disabled=false;
  try{currentAssetId=await saveAsset(currentBlob,`nexora-ai-${Date.now()}.png`);setStatus(`Gambar berhasil dibuat dan disimpan ke Asset Library · ${Math.round(currentBlob.size/1024)} KB.`);}catch(e){setStatus('Gambar berhasil dibuat, tetapi gagal disimpan ke Asset Library. Kamu masih bisa mengunduhnya.');}
 }catch(error){$('media-output-state').textContent='FAILED';setStatus(`Gagal: ${error.message}. Periksa API key, kuota, billing, dan dukungan model.`);}
 finally{button.disabled=false;button.textContent='✦ Generate Image';}
}
$('media-generate')?.addEventListener('click',generateImage);
$('media-download')?.addEventListener('click',()=>{if(!currentBlob)return;const a=document.createElement('a');a.href=currentUrl;a.download=`nexora-image-${Date.now()}.png`;a.click();});
$('media-send-composer')?.addEventListener('click',()=>{if(!currentAssetId){setStatus('Gambar belum tersimpan di Asset Library. Coba generate ulang.');return;}sessionStorage.setItem('nexora_composer_import_asset',String(currentAssetId));document.querySelector('[data-view="composer"]')?.click();setStatus('Gambar dikirim ke Video Composer.');});
