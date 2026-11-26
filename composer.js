const $ = (id) => document.getElementById(id);
const STORE = 'nexora_v100_composer_draft';
let scenes = [];
let previewTimer = null;
let lastVideoUrl = null;
let audioUrl = null;

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function setStatus(message){$('composer-status').textContent=message;}
function dimensions(){const ratio=$('composer-ratio').value;return ratio==='16:9'?[1280,720]:ratio==='1:1'?[900,900]:[720,1280];}
function resizeCanvas(){const [w,h]=dimensions(),c=$('composer-canvas');c.width=w;c.height=h;drawScene(0);}
function drawScene(index,progress=0){
 const c=$('composer-canvas'),ctx=c.getContext('2d'),scene=scenes[index];
 ctx.fillStyle='#111827';ctx.fillRect(0,0,c.width,c.height);
 if(scene?.image){const img=scene.image;const base=Math.max(c.width/img.width,c.height/img.height);let zoom=1,dx=0,dy=0;const motion=scene.motion||'kenburns';if(motion==='zoom-in')zoom=1+progress*.12;else if(motion==='zoom-out')zoom=1.12-progress*.12;else if(motion==='pan-left'){zoom=1.1;dx=progress*c.width*.08;}else if(motion==='pan-right'){zoom=1.1;dx=-progress*c.width*.08;}else if(motion==='pan-up'){zoom=1.1;dy=progress*c.height*.08;}else if(motion==='pan-down'){zoom=1.1;dy=-progress*c.height*.08;}else if(motion==='kenburns'){zoom=1+progress*.08;dx=-progress*c.width*.025;dy=-progress*c.height*.018;}const w=img.width*base*zoom,h=img.height*base*zoom;ctx.drawImage(img,(c.width-w)/2+dx,(c.height-h)/2+dy,w,h);}
 const transition=scene?.transition||'fade';
 if(scene && transition!=='cut'){const edge=Math.min(1,Math.max(0,Math.min(progress/.12,(1-progress)/.12)));if(transition==='black'){ctx.fillStyle=`rgba(0,0,0,${1-edge})`;ctx.fillRect(0,0,c.width,c.height);}else if(transition==='wipe'){ctx.save();ctx.beginPath();ctx.rect(0,0,c.width*edge,c.height);ctx.clip();if(scene.image){const img=scene.image,base=Math.max(c.width/img.width,c.height/img.height);ctx.drawImage(img,(c.width-img.width*base)/2,(c.height-img.height*base)/2,img.width*base,img.height*base);}ctx.restore();}else{ctx.fillStyle=`rgba(0,0,0,${1-edge})`;ctx.fillRect(0,0,c.width,c.height);}}
 const shade=ctx.createLinearGradient(0,c.height*.35,0,c.height);shade.addColorStop(0,'rgba(5,9,18,0.02)');shade.addColorStop(1,'rgba(5,9,18,0.88)');ctx.fillStyle=shade;ctx.fillRect(0,0,c.width,c.height);
 const title=$('composer-title').value.trim()||'NEXORA STUDIO';
 const pad=c.width*.075;ctx.textAlign='left';ctx.fillStyle='rgba(255,255,255,.72)';ctx.font=`600 ${Math.max(14,c.width*.025)}px Arial`;ctx.fillText('NEXORA STUDIO',pad,c.height*.09);
 ctx.fillStyle='#fff';ctx.font=`700 ${Math.max(28,c.width*.065)}px Arial`;wrapText(ctx,scene?.caption||title,pad,c.height*.76,c.width-pad*2,Math.max(34,c.width*.078));
 ctx.fillStyle='rgba(255,255,255,.68)';ctx.font=`${Math.max(13,c.width*.023)}px Arial`;ctx.fillText(`ADEGAN ${String(index+1).padStart(2,'0')} / ${String(scenes.length).padStart(2,'0')}`,pad,c.height*.93);
}
function wrapText(ctx,text,x,y,maxWidth,lineHeight){const words=String(text).split(/\s+/);let line='';const lines=[];for(const word of words){const test=line?line+' '+word:word;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=word;}else line=test;}if(line)lines.push(line);lines.slice(0,4).forEach((l,i)=>ctx.fillText(l,x,y+i*lineHeight));}
function renderScenes(){
 const host=$('composer-scenes');$('composer-scene-count').textContent=`${scenes.length} SCENES`;
 if(!scenes.length){host.innerHTML='<div class="composer-empty">Belum ada adegan. Tekan “Tambah adegan”.</div>';drawScene(0);return;}
 host.innerHTML='';scenes.forEach((scene,i)=>{
  const card=document.createElement('article');card.className='composer-scene-card';
  card.innerHTML=`<div class="composer-scene-head"><b>Adegan ${i+1}</b><button type="button" class="timeline-remove" aria-label="Hapus adegan">×</button></div><label class="field-label">Gambar adegan</label><input class="style-input scene-file" type="file" accept="image/*"><div class="composer-thumb">${scene.image?'<span>Gambar siap digunakan</span>':'<span>Belum ada gambar</span>'}</div><label class="field-label">Durasi adegan (detik)</label><input class="style-input scene-duration" type="number" min=2 max=30 value="${Number(scene.duration)||5}"><label class="field-label">Transisi</label><select class="style-input scene-transition"><option value="fade">Fade</option><option value="black">Fade melalui hitam</option><option value="wipe">Wipe</option><option value="cut">Cut</option></select><label class="field-label">Gerakan kamera</label><select class="style-input scene-motion"><option value="kenburns">Ken Burns · Zoom lembut</option><option value="zoom-in">Zoom in</option><option value="zoom-out">Zoom out</option><option value="pan-left">Pan kiri</option><option value="pan-right">Pan kanan</option><option value="pan-up">Pan atas</option><option value="pan-down">Pan bawah</option><option value="static">Diam / Static</option></select><label class="field-label">Teks / narasi layar</label><textarea class="style-input scene-caption" maxlength="500" placeholder="Deskripsikan adegan atau teks yang tampil...">${esc(scene.caption)}</textarea>`;
  card.querySelector('.timeline-remove').addEventListener('click',()=>{scenes.splice(i,1);renderScenes();});
  card.querySelector('.scene-caption').addEventListener('input',e=>{scene.caption=e.target.value;});
  const durationInput=card.querySelector('.scene-duration');durationInput.addEventListener('change',e=>{scene.duration=Math.max(2,Math.min(30,Number(e.target.value)||5));e.target.value=scene.duration;});
  const transition=card.querySelector('.scene-transition');transition.value=scene.transition||'fade';transition.addEventListener('change',e=>{scene.transition=e.target.value;drawScene(i);});
  const motion=card.querySelector('.scene-motion');motion.value=scene.motion||'kenburns';motion.addEventListener('change',e=>{scene.motion=e.target.value;drawScene(i);});
  card.querySelector('.scene-file').addEventListener('change',e=>{const file=e.target.files?.[0];if(!file)return;if(!file.type.startsWith('image/'))return;const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{scene.image=img;scene.fileName=file.name;card.querySelector('.composer-thumb').innerHTML='';card.querySelector('.composer-thumb').append(img);drawScene(i);};img.src=url;});
  host.append(card);
 });
}
function addScene(){scenes.push({caption:`Adegan ${scenes.length+1}`,image:null,fileName:'',motion:'kenburns',duration:5,transition:'fade'});renderScenes();drawScene(scenes.length-1);setStatus('Adegan ditambahkan. Unggah gambar dan isi teksnya.');}
function getProject(){return {version:'1.4.0',title:$('composer-title').value,ratio:$('composer-ratio').value,duration:Number($('composer-duration').value)||5,scenes:scenes.map(s=>({caption:s.caption,fileName:s.fileName,motion:s.motion||'kenburns',duration:s.duration||5,transition:s.transition||'fade'}))};}
function saveDraft(){try{localStorage.setItem(STORE,JSON.stringify(getProject()));setStatus('Draft proyek tersimpan di browser. File gambar/audio perlu dipilih ulang saat dibuka kembali.');}catch(e){setStatus('Draft tidak dapat disimpan. Penyimpanan browser mungkin penuh.');}}
function downloadText(name,text,type){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
function chooseMime(){return ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(t=>window.MediaRecorder?.isTypeSupported(t))||'';}
async function renderVideo(){
 if(!scenes.length){setStatus('Tambahkan adegan terlebih dahulu.');return;}
 if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream){setStatus('Browser ini belum mendukung perekaman canvas. Coba Chrome versi terbaru.');return;}
 const canvas=$('composer-canvas');resizeCanvas();const durations=scenes.map(s=>Math.max(2,Math.min(30,Number(s.duration)||Number($('composer-duration').value)||5)));const totalDuration=durations.reduce((a,b)=>a+b,0);
 const stream=canvas.captureStream(24);let audioCtx=null,audioElement=null;
 const audioFile=$('composer-audio').files?.[0];
 if(audioFile){try{audioCtx=new (window.AudioContext||window.webkitAudioContext)();await audioCtx.resume();audioElement=new Audio();audioElement.src=URL.createObjectURL(audioFile);audioElement.crossOrigin='anonymous';const source=audioCtx.createMediaElementSource(audioElement),dest=audioCtx.createMediaStreamDestination();source.connect(dest);dest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));}catch(e){console.warn('Audio mix unavailable',e);}}
 const mime=chooseMime();let recorder;try{recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);}catch(e){setStatus('Perekam tidak dapat dimulai pada browser ini.');return;}
 const chunks=[];recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};
 recorder.onerror=()=>setStatus('Terjadi kesalahan saat merekam. Coba render ulang.');
 const done=new Promise(resolve=>recorder.onstop=resolve);recorder.start(500);
 if(audioElement){try{await audioElement.play();}catch(e){console.warn('Audio playback blocked',e);}}
 const total=totalDuration*1000,start=performance.now();let stopped=false;
 $('composer-render').disabled=true;$('composer-preview').disabled=true;$('composer-render-status').textContent='Rendering dimulai… jangan tutup tab.';
 function frame(now){const elapsed=Math.min(total,now-start);let cursor=0,idx=0;while(idx<durations.length-1&&elapsed>=cursor+durations[idx]*1000){cursor+=durations[idx]*1000;idx++;}const within=Math.min(1,(elapsed-cursor)/(durations[idx]*1000));drawScene(idx,within);$('composer-render-status').textContent=`Rendering adegan ${idx+1}/${scenes.length} · ${Math.min(100,Math.floor(elapsed/total*100))}%`;if(elapsed<total&&!stopped)requestAnimationFrame(frame);else recorder.stop();}
 requestAnimationFrame(frame);await done;
 const blob=new Blob(chunks,{type:recorder.mimeType||'video/webm'});if(lastVideoUrl)URL.revokeObjectURL(lastVideoUrl);lastVideoUrl=URL.createObjectURL(blob);const link=$('composer-download');link.href=lastVideoUrl;link.download=(($('composer-title').value||'nexora-video').replace(/[^a-z0-9-_]+/gi,'-').toLowerCase())+'.webm';link.hidden=false;link.textContent=`Unduh video (${(blob.size/1024/1024).toFixed(1)} MB)`;
 stream.getTracks().forEach(t=>t.stop());if(audioCtx)await audioCtx.close();$('composer-render').disabled=false;$('composer-preview').disabled=false;$('composer-render-status').textContent=`Selesai. File WebM siap diunduh · ${(blob.size/1024/1024).toFixed(1)} MB.`;
}

async function importGeneratedAssetIfPresent(){
 const raw=sessionStorage.getItem('nexora_composer_import_asset');if(!raw)return;
 sessionStorage.removeItem('nexora_composer_import_asset');
 try{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('nexora_creative_v110',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const asset=await new Promise((resolve,reject)=>{const tx=db.transaction('assets','readonly'),req=tx.objectStore('assets').get(Number(raw));req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close();});
  if(!asset?.blob)throw new Error('Aset tidak ditemukan');
  const url=URL.createObjectURL(asset.blob),img=new Image();img.onload=()=>{scenes.push({caption:asset.name.replace(/\.[^.]+$/,''),image:img,fileName:asset.name,motion:'kenburns',duration:5,transition:'fade'});renderScenes();drawScene(scenes.length-1);setStatus(`Aset AI berhasil dimasukkan: ${asset.name}`);};img.onerror=()=>setStatus('Gambar tidak dapat dibuka.');img.src=url;
 }catch(e){setStatus('Tidak dapat mengimpor aset dari Asset Library.');}
}

function preview(){if(!scenes.length){setStatus('Tambahkan adegan terlebih dahulu.');return;}if(previewTimer){cancelAnimationFrame(previewTimer);previewTimer=null;drawScene(0);$('composer-render-status').textContent='Preview dihentikan.';return;}const durations=scenes.map(s=>Math.max(2,Math.min(30,Number(s.duration)||5))*1000),total=durations.reduce((a,b)=>a+b,0),start=performance.now();function tick(now){const elapsed=(now-start)%total;let cursor=0,idx=0;while(idx<durations.length-1&&elapsed>=cursor+durations[idx]){cursor+=durations[idx];idx++;}const progress=(elapsed-cursor)/durations[idx];drawScene(idx,progress);$('composer-render-status').textContent=`Preview · Adegan ${idx+1}/${scenes.length}`;previewTimer=requestAnimationFrame(tick);}previewTimer=requestAnimationFrame(tick);$('composer-render-status').textContent='Preview bergerak berjalan. Tekan Preview lagi untuk berhenti.';}
$('composer-add')?.addEventListener('click',addScene);
$('composer-save')?.addEventListener('click',saveDraft);
$('composer-export-project')?.addEventListener('click',()=>downloadText('nexora-project.json',JSON.stringify(getProject(),null,2),'application/json'));
$('composer-ratio')?.addEventListener('change',resizeCanvas);
$('composer-title')?.addEventListener('input',()=>drawScene(0));
$('composer-preview')?.addEventListener('click',preview);
$('composer-render')?.addEventListener('click',renderVideo);
try{const saved=JSON.parse(localStorage.getItem(STORE)||'null');if(saved){$('composer-title').value=saved.title||'NEXORA Production';$('composer-ratio').value=saved.ratio||'9:16';$('composer-duration').value=saved.duration||5;scenes=(saved.scenes||[]).map(s=>({...s,image:null,motion:s.motion||'kenburns',duration:s.duration||5,transition:s.transition||'fade'}));}}catch(e){}
resizeCanvas();renderScenes();importGeneratedAssetIfPresent();
const voiceDraft=sessionStorage.getItem('nexora_voice_to_composer');if(voiceDraft){sessionStorage.removeItem('nexora_voice_to_composer');if(!scenes.length)addScene();scenes[scenes.length-1].caption=voiceDraft.slice(0,500);renderScenes();drawScene(scenes.length-1);setStatus('Narasi Viona dimasukkan sebagai teks adegan. Untuk audio, unggah file audio melalui pengaturan proyek.');}

window.addEventListener('nexora:voice-file-ready', event => { const file=event.detail?.file; if(!file)return; try { const transfer=new DataTransfer(); transfer.items.add(file); $('composer-audio').files=transfer.files; setStatus(`Audio AI Viona terpasang: ${file.name}. Render untuk mencampurkan narasi ke video.`); } catch(e) { setStatus('Audio dibuat, tetapi browser tidak mengizinkan pemasangan otomatis. Unduh WAV lalu pilih manual pada kolom audio.'); } });
