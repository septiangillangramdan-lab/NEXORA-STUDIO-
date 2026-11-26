// NEXORA STUDIO v1.7.0 — supervised production control and local handoff board.
const $ = id => document.getElementById(id);
const KEY = 'nexora_production_control_v170';
const TASKS = [
  ['Septian','CEO','Tinjau arah proyek dan berikan persetujuan produksi.'],
  ['Arka','Director','Pastikan brief, jadwal, dan dependensi antar-departemen jelas.'],
  ['Nara','Research','Siapkan riset dan catatan sumber untuk klaim faktual.'],
  ['Saka','Fact Checker','Verifikasi klaim dan tandai bagian yang belum memiliki sumber.'],
  ['Raka','Story','Pastikan alur cerita, hook, konflik, dan penutup konsisten.'],
  ['Kirana','Scriptwriter','Finalisasi naskah, dialog, timecode, dan teks layar.'],
  ['Aira','Artist','Buat aset gambar dan character reference untuk setiap adegan.'],
  ['Kairo','Animator','Buat klip bergerak untuk adegan yang telah disetujui.'],
  ['Viona','Voice','Buat narasi audio dan periksa pelafalan serta tempo.'],
  ['Damar','Editor','Rangkai aset visual, audio, subtitle, dan transisi.'],
  ['Elara','Quality Control','Periksa kualitas, kesinambungan, audio, fakta, dan format akhir.']
];
let state = load();
function load(){try{return JSON.parse(localStorage.getItem(KEY))||{title:'',brief:'',importedRun:null,tasks:[],scenes:[]}}catch{return{title:'',brief:'',importedRun:null,tasks:[],scenes:[]}}}
function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch{alert('Penyimpanan browser penuh. Ekspor production pack dan hapus data yang tidak diperlukan.')}}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function render(){
  $('pc-project-title').value=state.title||''; $('pc-project-brief').value=state.brief||'';
  const done=state.tasks.filter(t=>t.status==='approved').length, review=state.tasks.filter(t=>t.status==='review').length;
  $('pc-agent-count').textContent=`${state.importedRun?.resultCount||0}/11`;$('pc-task-count').textContent=state.tasks.length;$('pc-review-count').textContent=review;$('pc-approved-count').textContent=done;
  $('pc-import-info').textContent=state.importedRun?`${state.importedRun.title} · ${state.importedRun.resultCount}/11 hasil Agent · diimpor ${state.importedRun.at}`:'Belum ada pipeline yang diimpor.';
  $('pc-task-list').innerHTML=state.tasks.length?state.tasks.map((t,i)=>`<article class="pc-task"><div class="pc-task-agent"><span>${String(i+1).padStart(2,'0')}</span><div><b>${esc(t.agent)} · ${esc(t.role)}</b><small>${esc(t.goal)}</small></div></div><div class="pc-task-evidence">${t.output?`<details><summary>Lihat hasil Agent</summary><p>${esc(t.output)}</p></details>`:'<small>Belum ada output dari pipeline.</small>'}</div><div class="pc-task-controls"><select class="style-input" data-task-status="${i}" aria-label="Status ${esc(t.agent)}"><option value="queued" ${t.status==='queued'?'selected':''}>Menunggu</option><option value="working" ${t.status==='working'?'selected':''}>Dikerjakan</option><option value="review" ${t.status==='review'?'selected':''}>Menunggu review</option><option value="approved" ${t.status==='approved'?'selected':''}>Disetujui</option><option value="revision" ${t.status==='revision'?'selected':''}>Perlu revisi</option></select><button class="secondary-button" data-handoff="${esc(t.agent)}" type="button">Buka studio</button></div></article>`).join(''):'<div class="auto-empty">Import pipeline untuk membangun daftar tugas departemen.</div>';
  document.querySelectorAll('[data-task-status]').forEach(el=>el.addEventListener('change',()=>{state.tasks[Number(el.dataset.taskStatus)].status=el.value;save();renderStatsOnly()}));
  document.querySelectorAll('[data-handoff]').forEach(el=>el.addEventListener('click',()=>handoff(el.dataset.handoff)));
  $('pc-scene-list').innerHTML=state.scenes.length?state.scenes.map((s,i)=>`<article class="pc-scene"><div class="pc-scene-number">${String(i+1).padStart(2,'0')}</div><div class="pc-scene-main"><b>${esc(s.title)}</b><p>${esc(s.prompt)}</p><small>Status: ${esc(s.status)}</small></div><div class="pc-scene-actions"><button class="secondary-button" data-scene-video="${i}" type="button">Kirim ke Kairo</button><button class="secondary-button" data-scene-remove="${i}" type="button">Hapus</button></div></article>`).join(''):'<div class="auto-empty">Belum ada adegan.</div>';
  document.querySelectorAll('[data-scene-video]').forEach(b=>b.addEventListener('click',()=>{const sc=state.scenes[Number(b.dataset.sceneVideo)];localStorage.setItem('nexora_pc_video_prompt',sc.prompt);openView('video')}));
  document.querySelectorAll('[data-scene-remove]').forEach(b=>b.addEventListener('click',()=>{state.scenes.splice(Number(b.dataset.sceneRemove),1);save();render()}));
}
function renderStatsOnly(){const d=state.tasks.filter(t=>t.status==='approved').length,r=state.tasks.filter(t=>t.status==='review').length;$('pc-review-count').textContent=r;$('pc-approved-count').textContent=d}
function openView(view){document.querySelector(`.nav-item[data-view="${view}"]`)?.click()}
function handoff(agent){
  const task=state.tasks.find(t=>t.agent===agent), output=task?.output||'';
  if(agent==='Aira'){const field=$('media-prompt');if(field&&output)field.value=output.slice(0,3500);openView('media')}
  else if(agent==='Kairo'){const sceneText=state.scenes.map(s=>s.prompt).join('\n\n');const field=$('video-prompt');if(field)field.value=(sceneText||output).slice(0,1800);openView('video')}
  else if(agent==='Viona'){const field=$('voice-script');if(field&&output)field.value=output.slice(0,3500);openView('voice')}
  else if(agent==='Damar'){openView('composer')}
  else if(agent==='Elara'){alert('Lakukan pemeriksaan akhir pada hasil pipeline dan file video sebelum menyatakan proyek selesai.')}
  else openView('autonomous')
}
$('pc-import')?.addEventListener('click',()=>{
  let runs=[];try{runs=JSON.parse(localStorage.getItem('nexora_autonomous_v090')||'{}').runs||[]}catch{}
  const run=runs[0];if(!run){alert('Belum ada hasil. Jalankan Autonomous Studio terlebih dahulu, lalu kembali ke sini.');return}
  state.title=run.title||'NEXORA Production';state.brief=[run.brief||'',run.extra?`Konteks tambahan:\n${run.extra}`:''].filter(Boolean).join('\n\n');
  state.importedRun={id:run.id,title:run.title,resultCount:run.results?.length||0,at:new Date().toLocaleString('id-ID')};
  state.tasks=TASKS.map(([agent,role,goal])=>{const result=(run.results||[]).find(r=>r.agent===agent);return{agent,role,goal,output:result?.text||'',status:result?'review':'queued'}});
  save();render();
});
$('pc-project-title')?.addEventListener('input',e=>{state.title=e.target.value;save()});$('pc-project-brief')?.addEventListener('input',e=>{state.brief=e.target.value;save()});
$('pc-add-scene')?.addEventListener('click',()=>{const title=$('pc-scene-title').value.trim(),prompt=$('pc-scene-prompt').value.trim();if(!title||!prompt){alert('Isi judul dan deskripsi adegan.');return}state.scenes.push({title,prompt,status:'queued',created:new Date().toISOString()});$('pc-scene-title').value='';$('pc-scene-prompt').value='';save();render()});
$('pc-export')?.addEventListener('click',()=>{const blob=new Blob([JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`NEXORA-production-${(state.title||'project').replace(/[^a-z0-9-_]/gi,'-').slice(0,40)}.json`;a.click();URL.revokeObjectURL(url)});
render();
