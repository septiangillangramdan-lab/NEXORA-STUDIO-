const $ = id => document.getElementById(id);
const KEY = 'nexora_v150_voice_draft';
let availableVoices = [];
let generatedBlob = null;
let generatedUrl = null;
let generatedName = 'nexora-voice.wav';
function setStatus(t){ $('voice-status').textContent=t; }
function refreshVoices(){
  if(!('speechSynthesis' in window)){ $('voice-select').innerHTML='<option value="">Speech Synthesis tidak didukung</option>'; return; }
  availableVoices = speechSynthesis.getVoices();
  const select=$('voice-select'), previous=select.value; select.innerHTML='';
  if(!availableVoices.length){select.innerHTML='<option value="">Suara belum tersedia</option>';return;}
  availableVoices.forEach((v,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=`${v.name} — ${v.lang}${v.default?' · Default':''}`;select.append(o);});
  const preferred=availableVoices.findIndex(v=>/^id(-|_)/i.test(v.lang));
  select.value=previous && availableVoices[Number(previous)] ? previous : String(preferred>=0?preferred:0);
}
function stop(){ if('speechSynthesis' in window) speechSynthesis.cancel(); setStatus('Pembacaan perangkat dihentikan.'); }
function speak(){
  const text=$('voice-script').value.trim(); if(!text){setStatus('Isi teks narasi terlebih dahulu.');return;}
  if(!('speechSynthesis' in window)){setStatus('Speech Synthesis tidak tersedia di browser ini.');return;}
  speechSynthesis.cancel(); const utterance=new SpeechSynthesisUtterance(text);
  const voice=availableVoices[Number($('voice-select').value)]; if(voice) utterance.voice=voice;
  utterance.rate=Number($('voice-rate').value); utterance.pitch=Number($('voice-pitch').value);
  utterance.onstart=()=>setStatus('Pratinjau suara perangkat berjalan…'); utterance.onend=()=>setStatus('Pratinjau perangkat selesai.'); utterance.onerror=e=>setStatus(`Pratinjau gagal: ${e.error||'kesalahan suara'}.`);
  speechSynthesis.speak(utterance);
}
function save(){try{localStorage.setItem(KEY,JSON.stringify({title:$('voice-title').value,script:$('voice-script').value,style:$('voice-ai-style').value,voice:$('voice-ai-voice').value,language:$('voice-ai-language').value,model:$('voice-ai-select').value,rate:$('voice-rate').value,pitch:$('voice-pitch').value}));setStatus('Naskah dan preferensi suara tersimpan di browser.');}catch(e){setStatus('Tidak dapat menyimpan naskah. Penyimpanan browser mungkin penuh.');}}
function pcmToWav(buffer,sampleRate=24000,channels=1){
  const bytes=buffer.byteLength, wav=new ArrayBuffer(44+bytes), view=new DataView(wav);
  const write=(offset,str)=>{for(let i=0;i<str.length;i++)view.setUint8(offset+i,str.charCodeAt(i));};
  write(0,'RIFF');view.setUint32(4,36+bytes,true);write(8,'WAVE');write(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*channels*2,true);view.setUint16(32,channels*2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,bytes,true);new Uint8Array(wav,44).set(new Uint8Array(buffer));return new Blob([wav],{type:'audio/wav'});
}
function decodeAudio(audio){
  const binary=atob(audio.data), bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  const mime=(audio.mimeType||'audio/wav').toLowerCase();
  if(mime.includes('wav') || (bytes[0]===82&&bytes[1]===73&&bytes[2]===70&&bytes[3]===70)) return new Blob([bytes],{type:'audio/wav'});
  return pcmToWav(bytes.buffer,24000,1);
}
function safeFileName(name){return (name||'nexora-voice').normalize('NFKD').replace(/[^a-z0-9-_]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,60)||'nexora-voice';}
async function generateAI(){
  const text=$('voice-script').value.trim();
  if(!text){setStatus('Isi teks narasi terlebih dahulu.');return;}
  if(text.length>3500){setStatus('Naskah terlalu panjang. Maksimum 3.500 karakter per generasi; bagi menjadi beberapa bagian.');return;}
  const button=$('voice-ai-generate');button.disabled=true;button.textContent='Memproses suara…';$('voice-ai-download').disabled=true;$('voice-ai-send').disabled=true;setStatus('Mengirim naskah ke Gemini TTS. Jangan tutup tab…');
  try{
    const response=await fetch('/.netlify/functions/gemini-tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,voice:$('voice-ai-voice').value,style:$('voice-ai-style').value,language:$('voice-ai-language').value,model:$('voice-ai-select').value})});
    const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`Permintaan gagal (${response.status}).`);
    if(!data.audio?.data)throw new Error('Respons tidak berisi file audio.');
    generatedBlob=decodeAudio(data.audio);if(generatedUrl)URL.revokeObjectURL(generatedUrl);generatedUrl=URL.createObjectURL(generatedBlob);generatedName=`${safeFileName($('voice-title').value)}.wav`;
    const player=$('voice-ai-audio');player.src=generatedUrl;player.hidden=false;$('voice-ai-download').disabled=false;$('voice-ai-send').disabled=false;
    setStatus(`Audio AI berhasil dibuat · ${data.model||'Gemini TTS'} · ${(generatedBlob.size/1024/1024).toFixed(2)} MB. Dengarkan dan periksa hasilnya.`);
  }catch(error){setStatus(`Generasi gagal: ${error.message}`);}
  finally{button.disabled=false;button.textContent='✦ Generate AI Voice';}
}
function downloadAI(){if(!generatedBlob)return;const a=document.createElement('a');a.href=generatedUrl;a.download=generatedName;a.click();}
function sendToComposer(){
  if(!generatedBlob)return;
  const file=new File([generatedBlob],generatedName,{type:'audio/wav'});
  document.querySelector('[data-view="composer"]')?.click();
  setTimeout(()=>window.dispatchEvent(new CustomEvent('nexora:voice-file-ready',{detail:{file}})),120);
  setStatus('Audio dikirim ke Video Composer.');
}
$('voice-play')?.addEventListener('click',speak); $('voice-stop')?.addEventListener('click',stop); $('voice-save')?.addEventListener('click',save);
$('voice-ai-generate')?.addEventListener('click',generateAI);$('voice-ai-download')?.addEventListener('click',downloadAI);$('voice-ai-send')?.addEventListener('click',sendToComposer);
$('voice-copy')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('voice-script').value);setStatus('Teks narasi disalin.');}catch(e){setStatus('Clipboard tidak tersedia. Pilih dan salin teks secara manual.');}});
$('voice-send')?.addEventListener('click',()=>{const text=$('voice-script').value.trim();if(!text){setStatus('Isi naskah terlebih dahulu.');return;}sessionStorage.setItem('nexora_voice_to_composer',text);document.querySelector('[data-view="composer"]')?.click();});
$('voice-rate')?.addEventListener('input',e=>$('voice-rate-value').textContent=`${Number(e.target.value).toFixed(2)}×`);
$('voice-pitch')?.addEventListener('input',e=>$('voice-pitch-value').textContent=Number(e.target.value).toFixed(2));
if('speechSynthesis' in window){refreshVoices();speechSynthesis.onvoiceschanged=refreshVoices;}
try{const d=JSON.parse(localStorage.getItem(KEY)||'null');if(d){$('voice-title').value=d.title||'Narasi NEXORA';$('voice-script').value=d.script||'';$('voice-rate').value=d.rate||1;$('voice-pitch').value=d.pitch||1;$('voice-ai-style').value=d.style||$('voice-ai-style').value;$('voice-ai-voice').value=d.voice||'Kore';$('voice-ai-language').value=d.language||'Indonesian';$('voice-ai-select').value=d.model||'gemini-3.8-flash-lite-tts';$('voice-rate-value').textContent=`${Number($('voice-rate').value).toFixed(2)}×`;$('voice-pitch-value').textContent=Number($('voice-pitch').value).toFixed(2);}}catch(e){}
