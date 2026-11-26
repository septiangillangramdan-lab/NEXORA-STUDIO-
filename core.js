// NEXORA CORE SYSTEM v0.6.0 — local coordination prototype.
const KEY='nexora_core_v060';
const roster=[
 ['Septian','CEO'],['Arka','Director'],['Nara','Research'],['Saka','Fact Checker'],['Raka','Story'],['Kirana','Scriptwriter'],['Aira','Artist'],['Kairo','Animator'],['Viona','Voice'],['Damar','Editor'],['Elara','Quality Control']
];
const routes={research:'Nara',fact:'Saka',story:'Raka',script:'Kirana',visual:'Arka',art:'Aira',animation:'Kairo',voice:'Viona',edit:'Damar',qc:'Elara'};
const typeNames={research:'Riset & tren',fact:'Pemeriksaan fakta',story:'Pengembangan cerita',script:'Penulisan naskah',visual:'Arahan visual',art:'Ilustrasi',animation:'Animasi',voice:'Voice over',edit:'Editing video',qc:'Quality control'};
const $=id=>document.getElementById(id); const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data=load();
function load(){try{const d=JSON.parse(localStorage.getItem(KEY));if(d&&Array.isArray(d.tasks))return d;}catch(e){}return{tasks:[],messages:[],history:[],quota:{}}}
function save(){try{localStorage.setItem(KEY,JSON.stringify(data));}catch(e){alert('Penyimpanan lokal penuh. Hapus sebagian riwayat atau data browser.')}}
function stamp(){return new Date().toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'})}
function log(text){data.history.unshift({id:Date.now()+Math.random(),text,at:stamp()});data.history=data.history.slice(0,80);}
function addTask(title,type,notes=''){return{id:'q'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),title,type,notes,agent:routes[type],status:'queued',created:stamp(),updated:stamp()}}
function render(){
 $('core-agent-count').textContent=roster.length;$('core-queue-count').textContent=data.tasks.filter(t=>t.status==='queued').length;$('core-working-count').textContent=data.tasks.filter(t=>t.status==='working').length;$('core-log-count').textContent=data.history.length;
 $('core-queue').innerHTML=data.tasks.length?data.tasks.map(t=>`<article class="core-task"><div class="core-task-copy"><b>${esc(t.title)}</b><small>${esc(typeNames[t.type]||t.type)} · ${esc(t.agent||'Belum dialokasikan')}</small>${t.notes?`<p>${esc(t.notes)}</p>`:''}</div><span class="core-pill ${t.status}">${({queued:'Menunggu',working:'Berjalan',paused:'Jeda kuota',done:'Selesai'})[t.status]}</span><div class="core-task-buttons">${t.status==='queued'?`<button data-start="${t.id}">Mulai</button>`:''}${t.status==='working'?`<button data-done="${t.id}">Selesaikan</button><button data-pause="${t.id}">Jeda</button>`:''}${t.status==='paused'?`<button data-resume="${t.id}">Lanjutkan</button>`:''}<button class="danger" data-remove="${t.id}">Hapus</button></div></article>`).join(''):'<div class="empty-timeline">Antrean masih kosong. Tambahkan tugas pertama.</div>';
 $('core-messages').innerHTML=data.messages.length?data.messages.slice(0,20).map(m=>`<article class="core-message"><b>${esc(m.from)} <span>→</span> ${esc(m.to)}</b><p>${esc(m.body)}</p><small>${esc(m.at)}</small></article>`).join(''):'<div class="empty-timeline">Belum ada pesan internal.</div>';
 $('core-history').innerHTML=data.history.length?data.history.slice(0,25).map(h=>`<div class="history-row"><span>•</span><div>${esc(h.text)}<small>${esc(h.at)}</small></div></div>`).join(''):'<div class="empty-timeline">Riwayat akan muncul saat Core digunakan.</div>';
 $('core-quota-list').innerHTML=roster.slice(1).map(([name])=>{const limited=!!data.quota[name];return`<div class="quota-row"><div><b>${name}</b><small>${limited?'Kuota ditandai mencapai batas':'Kuota ditandai tersedia'}</small></div><button type="button" data-quota="${name}" class="${limited?'quota-limited':''}">${limited?'Tandai tersedia':'Tandai limit'}</button></div>`}).join('');
 document.querySelectorAll('[data-start]').forEach(b=>b.onclick=()=>changeTask(b.dataset.start,'working'));
 document.querySelectorAll('[data-done]').forEach(b=>b.onclick=()=>changeTask(b.dataset.done,'done'));
 document.querySelectorAll('[data-pause]').forEach(b=>b.onclick=()=>changeTask(b.dataset.pause,'paused'));
 document.querySelectorAll('[data-resume]').forEach(b=>b.onclick=()=>changeTask(b.dataset.resume,'working'));
 document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{data.tasks=data.tasks.filter(t=>t.id!==b.dataset.remove);log('Tugas dihapus dari antrean.');save();render()});
 document.querySelectorAll('[data-quota]').forEach(b=>b.onclick=()=>toggleQuota(b.dataset.quota));
}
function changeTask(id,status){const t=data.tasks.find(x=>x.id===id);if(!t)return;if(status==='working'&&data.quota[t.agent]){alert(`${t.agent} sedang dijeda karena status kuota limit. Tandai kuota tersedia terlebih dahulu.`);return;}t.status=status;t.updated=stamp();log(`${t.agent}: "${t.title}" → ${{working:'mulai dikerjakan (simulasi)',done:'ditandai selesai',paused:'dijeda'}[status]||status}.`);save();render();}
function toggleQuota(name){data.quota[name]=!data.quota[name];if(data.quota[name]){data.tasks.forEach(t=>{if(t.agent===name&&t.status==='working'){t.status='paused';t.updated=stamp();}});log(`${name} mencapai batas kuota simulasi; tugas aktif dijeda dan progress lokal dipertahankan.`);}else{log(`Status kuota ${name} ditandai tersedia kembali. Tugas jeda dapat dilanjutkan manual.`);}save();render();}
const from=$('core-message-from'),to=$('core-message-to');roster.forEach(([name])=>{from.add(new Option(name,name));to.add(new Option(name,name));});from.value='Septian';to.value='Arka';
$('core-task-form').addEventListener('submit',e=>{e.preventDefault();const title=$('core-task-title').value.trim();if(!title)return;const type=$('core-task-type').value;const t=addTask(title,type,$('core-task-notes').value.trim());data.tasks.unshift(t);log(`Tugas baru dialokasikan otomatis ke ${t.agent}: "${title}".`);save();e.target.reset();render();});
$('core-dispatch').addEventListener('click',()=>{let n=0;data.tasks.forEach(t=>{if(t.status==='queued'&&!data.quota[t.agent]){t.status='working';t.updated=stamp();log(`Dispatch: ${t.agent} mulai mengerjakan "${t.title}" (simulasi).`);n++;}});save();render();if(!n)alert('Tidak ada tugas menunggu yang dapat dijalankan. Periksa antrean atau status kuota.');});
$('core-message-form').addEventListener('submit',e=>{e.preventDefault();const body=$('core-message-body').value.trim();if(!body)return;data.messages.unshift({from:from.value,to:to.value,body,at:stamp()});data.messages=data.messages.slice(0,60);log(`Pesan internal dikirim: ${from.value} → ${to.value}.`);save();e.target.reset();from.value='Septian';to.value='Arka';render();});
$('core-clear-log').addEventListener('click',()=>{if(!confirm('Bersihkan seluruh riwayat aktivitas Core?'))return;data.history=[];save();render();});
render();
