const STORE_KEY = 'nexora-production-v040';
const agents = [
  'Nara','Saka','Raka','Kirana','Arka',
  'Aira','Kairo','Viona','Damar','Elara','Septian'
];
const workflow = [
  ['Riset topik & referensi','Nara','Mengumpulkan konteks, tren, dan bahan referensi.'],
  ['Pemeriksaan fakta','Saka','Memeriksa klaim dan mencatat sumber yang dibutuhkan.'],
  ['Pengembangan cerita','Raka','Menyusun alur, karakter, dan struktur cerita.'],
  ['Penulisan naskah','Kirana','Menulis narasi, dialog, dan arahan adegan.'],
  ['Arahan visual & storyboard','Arka','Menentukan pendekatan visual dan urutan adegan.'],
  ['Pembuatan ilustrasi','Aira','Menyiapkan rancangan visual untuk setiap adegan.'],
  ['Animasi adegan','Kairo','Merencanakan gerakan dan transisi visual.'],
  ['Voice over','Viona','Menyiapkan kebutuhan narasi dan audio.'],
  ['Penyuntingan video','Damar','Merencanakan susunan gambar, audio, dan tempo.'],
  ['Pemeriksaan kualitas','Elara','Memeriksa konsistensi, keterbacaan, dan kelengkapan.']
];
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state = load();
let selectedId = state.projects[0]?.id || null;
function load(){ try { const data=JSON.parse(localStorage.getItem(STORE_KEY)); if(data && Array.isArray(data.projects)) return data; } catch(e){} return {projects:[]}; }
function save(){ try { localStorage.setItem(STORE_KEY,JSON.stringify(state)); } catch(e){ alert('Penyimpanan browser penuh atau tidak tersedia.'); } }
function makeProject(name,type,brief,style){
  const id='p'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  return {id,name,type,brief,style,created:new Date().toISOString(),tasks:workflow.map((w,i)=>({id:id+'t'+i,title:w[0],agent:w[1],description:w[2],status:'queued'}))};
}
function current(){return state.projects.find(p=>p.id===selectedId);}
function render(){
  const projects=state.projects, tasks=projects.flatMap(p=>p.tasks);
  $('pm-total-projects').textContent=projects.length;
  $('pm-done').textContent=tasks.filter(t=>t.status==='done').length;
  $('pm-active').textContent=tasks.filter(t=>t.status==='working').length;
  $('pm-queued').textContent=tasks.filter(t=>t.status==='queued'||t.status==='paused').length;
  $('pm-project-count').textContent=`${projects.length} PROYEK`;
  $('pm-project-list').innerHTML=projects.length?projects.map(p=>`<button type="button" class="pm-project ${p.id===selectedId?'selected':''}" data-project="${esc(p.id)}"><span class="pm-project-icon">🎬</span><span class="pm-project-copy"><b>${esc(p.name)}</b><small>${esc(p.type)} · ${p.tasks.filter(t=>t.status==='done').length}/${p.tasks.length} tugas selesai</small></span><span class="pm-project-arrow">›</span></button>`).join(''):'<div class="empty-timeline">Belum ada proyek. Buat proyek pertama di formulir.</div>';
  document.querySelectorAll('[data-project]').forEach(b=>b.addEventListener('click',()=>{selectedId=b.dataset.project;render();}));
  const p=current();
  $('pm-selected-project').textContent=p?`${p.name} · ${p.style} · Dibuat ${new Date(p.created).toLocaleDateString('id-ID')}`:'Pilih atau buat proyek untuk melihat alur kerjanya.';
  $('pm-task-board').innerHTML=p?`<div class="task-board-head"><span>TAHAP / TUGAS</span><span>AGENT PENANGGUNG JAWAB</span><span>STATUS & AKSI</span></div>`+p.tasks.map((t,i)=>`<article class="pm-task"><div class="pm-task-main"><span class="pm-task-index">${String(i+1).padStart(2,'0')}</span><div><b>${esc(t.title)}</b><small>${esc(t.description)}</small></div></div><label class="agent-select-wrap"><span class="mobile-field-label">Agent</span><select class="style-input pm-agent-select" data-task-agent="${esc(t.id)}">${agents.map(a=>`<option ${a===t.agent?'selected':''}>${esc(a)}</option>`).join('')}</select></label><div class="pm-task-actions"><span class="task-status ${t.status}">${statusLabel(t.status)}</span><select class="style-input pm-status-select" aria-label="Ubah status ${esc(t.title)}" data-task-status="${esc(t.id)}"><option value="queued" ${t.status==='queued'?'selected':''}>Menunggu</option><option value="working" ${t.status==='working'?'selected':''}>Berjalan</option><option value="paused" ${t.status==='paused'?'selected':''}>Ditunda</option><option value="done" ${t.status==='done'?'selected':''}>Selesai</option></select></div></article>`).join(''):`<div class="empty-timeline">Tugas produksi akan muncul di sini setelah kamu membuat proyek.</div>`;
  document.querySelectorAll('[data-task-agent]').forEach(el=>el.addEventListener('change',()=>updateTask(el.dataset.taskAgent,'agent',el.value)));
  document.querySelectorAll('[data-task-status]').forEach(el=>el.addEventListener('change',()=>updateTask(el.dataset.taskStatus,'status',el.value)));
}
function statusLabel(s){return ({queued:'Menunggu',working:'Berjalan',paused:'Ditunda',done:'Selesai'})[s]||s;}
function updateTask(taskId,key,value){const p=current();if(!p)return;const t=p.tasks.find(x=>x.id===taskId);if(!t)return;t[key]=value;save();render();}
$('pm-project-form')?.addEventListener('submit',e=>{
  e.preventDefault();const name=$('pm-project-name').value.trim();if(!name)return;
  const p=makeProject(name,$('pm-project-type').value,$('pm-project-brief').value.trim(),$('pm-project-style').value);
  state.projects.unshift(p);selectedId=p.id;save();e.target.reset();$('pm-project-name').value='';render();
});
$('pm-reset-demo')?.addEventListener('click',()=>{if(!confirm('Hapus semua proyek lokal dan mulai dari kosong?'))return;state={projects:[]};selectedId=null;save();render();});
render();
