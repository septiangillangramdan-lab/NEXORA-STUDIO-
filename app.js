import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const employees = [
  {id:"ceo",name:"Septian",role:"Chief Executive Officer",initial:"S",status:"working",activity:"Memimpin strategi dan mengawasi perusahaan",personality:"Visioner, bertanggung jawab, terbuka pada ide",break:"Membaca, menikmati kopi, dan mengevaluasi ide",room:"executive"},
  {id:"director",name:"Arka",role:"Director Agent",initial:"A",status:"working",activity:"Menyusun arahan dan prioritas produksi",personality:"Tegas, terstruktur, visioner",break:"Duduk santai dan mendengarkan musik",room:"executive"},
  {id:"research",name:"Nara",role:"Research Agent",initial:"N",status:"working",activity:"Menganalisis topik dan tren global",personality:"Penasaran, analitis, teliti",break:"Membaca buku dan menjelajah informasi",room:"research"},
  {id:"fact",name:"Saka",role:"Fact Checker",initial:"S",status:"idle",activity:"Menunggu bahan untuk diverifikasi",personality:"Kritis, hati-hati, objektif",break:"Mendengarkan musik instrumental",room:"research"},
  {id:"story",name:"Raka",role:"Story Agent",initial:"R",status:"working",activity:"Mengembangkan alur cerita",personality:"Imajinatif, ekspresif, peka",break:"Menulis ide bebas di taman",room:"creative"},
  {id:"script",name:"Kirana",role:"Scriptwriter",initial:"K",status:"idle",activity:"Menunggu konsep cerita",personality:"Komunikatif, runtut, kreatif",break:"Membaca novel dan mengobrol santai",room:"creative"},
  {id:"artist",name:"Aira",role:"Artist Agent",initial:"A",status:"resting",activity:"Istirahat di lounge",personality:"Visual, detail, eksperimental",break:"Menggambar bebas dan minum kopi",room:"lounge"},
  {id:"animator",name:"Kairo",role:"Animator Agent",initial:"K",status:"resting",activity:"Beristirahat setelah menyusun gerakan",personality:"Sabar, tekun, dinamis",break:"Bermain pingpong",room:"lounge"},
  {id:"voice",name:"Viona",role:"Voice Agent",initial:"V",status:"resting",activity:"Recovery setelah sesi audio",personality:"Tenang, artikulatif, konsisten",break:"Mendengarkan musik",room:"lounge"},
  {id:"editor",name:"Damar",role:"Video Editor",initial:"D",status:"working",activity:"Menyusun draft video",personality:"Perfeksionis, efisien, teliti",break:"Menonton referensi film",room:"production"},
  {id:"qc",name:"Elara",role:"Quality Control",initial:"E",status:"idle",activity:"Menunggu hasil produksi untuk diperiksa",personality:"Objektif, detail, konsisten",break:"Berjalan santai dan merapikan catatan",room:"production"}
];

const canvasHost = document.getElementById("office-canvas");
const loading = document.getElementById("scene-loading");
let scene, camera, renderer, controls, officeGroup, labelGroup;
let showLabels = true;
let activeRoom = "all";
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const agentMeshes = [];
const clock = new THREE.Clock();

function mat(color, roughness=0.8) { return new THREE.MeshStandardMaterial({color, roughness}); }
function box(parent, x,y,z,w,h,d, material, cast=true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), material);
  mesh.position.set(x,y,z); mesh.castShadow=cast; mesh.receiveShadow=true; parent.add(mesh); return mesh;
}
function addLabel(parent, text, x,y,z) {
  const c=document.createElement("canvas"), ctx=c.getContext("2d");
  ctx.font="600 24px Arial"; const width=Math.max(100,ctx.measureText(text).width+28);
  c.width=width; c.height=48; const g=c.getContext("2d");
  g.fillStyle="rgba(22,32,50,.82)"; roundRect(g,0,0,width,48,13); g.fill();
  g.font="600 24px Arial"; g.fillStyle="#ffffff"; g.textAlign="center"; g.textBaseline="middle"; g.fillText(text,width/2,25);
  const texture=new THREE.CanvasTexture(c); texture.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false}));
  sprite.scale.set(width/105,0.46,1); sprite.position.set(x,y,z); sprite.userData.label=true; parent.add(sprite); return sprite;
}
function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function makePerson(parent, employee, x,z) {
  const group=new THREE.Group(); group.position.set(x,0,z); group.userData.employeeId=employee.id;
  const shirtColors={working:0x7a70df,resting:0xe2a54b,idle:0x6e9dbb};
  const shirt=mat(shirtColors[employee.status]);
  const skin=mat(0xf0c7a6), dark=mat(0x30364b), hair=mat(0x394056);
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(.18,.35,4,8),shirt); body.position.y=.48; body.castShadow=true; group.add(body);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.17,16,12),skin); head.position.y=.91; head.castShadow=true; group.add(head);
  const hairCap=new THREE.Mesh(new THREE.SphereGeometry(.174,16,8,0,Math.PI*2,0,Math.PI*.52),hair); hairCap.position.y=.96; group.add(hairCap);
  const leg1=box(group,-.085,.13,0,.09,.27,.1,dark), leg2=box(group,.085,.13,0,.09,.27,.1,dark);
  const badge=box(group,0,.55,.18,.13,.09,.025,mat(0xffffff),false);
  group.userData.parts={body,head,leg1,leg2};
  parent.add(group); agentMeshes.push(group);
  addLabel(labelGroup,employee.name,x,1.42,z);
  return group;
}
function makeDesk(parent,x,z,employee) {
  const wood=mat(0xb9a88e), metal=mat(0x657187), screen=mat(0x26354d), glow=mat(0x8e83f4);
  box(parent,x,.48,z,1.25,.09,.72,wood);
  for(const dx of [-.52,.52]) for(const dz of [-.27,.27]) box(parent,x+dx,.23,z+dz,.055,.46,.055,metal);
  box(parent,x,.88,z-.24,.47,.32,.055,metal);
  box(parent,x,.89,z-.205,.4,.24,.018,screen);
  box(parent,x,.89,z-.193,.27,.018,.008,glow,false);
  box(parent,x,.55,z+.15,.35,.025,.2,mat(0xd8dce6),false);
}
function roomSign(parent,text,x,z,color=0x7669df) {
  box(parent,x,1.85,z,.95,.38,.055,mat(color));
  addLabel(parent,text,x,2.12,z-.03);
}
function buildOffice() {
  scene=new THREE.Scene(); scene.background=new THREE.Color(0xeef1f8);
  camera=new THREE.PerspectiveCamera(38,canvasHost.clientWidth/canvasHost.clientHeight,.1,100);
  camera.position.set(10,10,13);
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  renderer.setSize(canvasHost.clientWidth,canvasHost.clientHeight);
  renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  canvasHost.appendChild(renderer.domElement);
  controls=new OrbitControls(camera,renderer.domElement); controls.enableDamping=true; controls.target.set(0,.4,0); controls.maxPolarAngle=Math.PI/2.05; controls.minDistance=7; controls.maxDistance=24;
  scene.add(new THREE.HemisphereLight(0xffffff,0xc4c9d7,2.1));
  const sun=new THREE.DirectionalLight(0xffffff,2.1); sun.position.set(7,12,8); sun.castShadow=true; sun.shadow.mapSize.set(1024,1024); scene.add(sun);
  officeGroup=new THREE.Group(); scene.add(officeGroup); labelGroup=new THREE.Group(); officeGroup.add(labelGroup);
  const floor=mat(0xe0e5ef), wall=mat(0xd8deea), accent=mat(0x9a8ef0), glass= new THREE.MeshStandardMaterial({color:0xc9d8ed,transparent:true,opacity:.35,roughness:.2});
  box(officeGroup,0,-.12,0,13,.24,9,floor);
  // Rear and side walls, leaving the front open for viewing.
  box(officeGroup,0,1.35,-4.42,13,2.7,.16,wall);
  box(officeGroup,-6.42,1.35,0,.16,2.7,9,wall);
  box(officeGroup,6.42,1.35,0,.16,2.7,9,wall);
  // Dividing low walls
  box(officeGroup,-2.2,.45,-1.5,.12,.9,5.7,wall);
  box(officeGroup,2.15,.45,-1.5,.12,.9,5.7,wall);
  box(officeGroup,0,.45,1.3,4.3,.9,.12,wall);
  // room rugs
  box(officeGroup,-4.25,.012,-2.55,3.6,.035,2.9,mat(0xe8e5fa),false);
  box(officeGroup,0,.012,-2.55,3.7,.035,2.9,mat(0xe5f1f1),false);
  box(officeGroup,4.25,.012,-2.55,3.6,.035,2.9,mat(0xf8eddf),false);
  box(officeGroup,-4.25,.014,2.2,3.6,.035,3.3,mat(0xe9eff9),false);
  box(officeGroup,4.25,.014,2.2,3.6,.035,3.3,mat(0xf9eddf),false);
  roomSign(officeGroup,"EXECUTIVE",-4.25,-4.25,0x7165d7);
  roomSign(officeGroup,"RESEARCH",0,-4.25,0x4c9b91);
  roomSign(officeGroup,"CREATIVE",4.25,-4.25,0xd19b55);
  roomSign(officeGroup,"PRODUCTION",-4.25,4.05,0x638ac2);
  roomSign(officeGroup,"LOUNGE",4.25,4.05,0xc18c57);
  // executive desk and meeting table
  makeDesk(officeGroup,-4.45,-2.4,employees[0]); makeDesk(officeGroup,-3.45,-2.4,employees[1]);
  box(officeGroup,-4.1,.4,-.95,1.5,.12,.65,mat(0xb9a88e));
  // research desks
  makeDesk(officeGroup,-.8,-2.4,employees[2]); makeDesk(officeGroup,.75,-2.4,employees[3]);
  // creative desks
  makeDesk(officeGroup,3.5,-2.4,employees[4]); makeDesk(officeGroup,4.9,-2.4,employees[5]);
  // production desks
  makeDesk(officeGroup,-4.8,2.35,employees[9]);
  makeDesk(officeGroup,-3.35,2.35,employees[10]);
  box(officeGroup,-3.6,.9,2.25,.9,.7,.08,mat(0x34425b));
  // lounge sofa, coffee table, coffee station, ping pong
  box(officeGroup,3.6,.35,2.15,1.8,.55,.65,mat(0x8c83c7));
  box(officeGroup,3.6,.62,1.86,1.8,.18,.22,mat(0x9c94d4));
  box(officeGroup,4.8,.25,3.05,.9,.12,.6,mat(0xb99b79));
  const cup= new THREE.Mesh(new THREE.CylinderGeometry(.08,.07,.13,16),mat(0xffffff)); cup.position.set(4.8,.38,3.05); officeGroup.add(cup);
  box(officeGroup,5.4,.55,1.3,.7,1.05,.55,mat(0x9aa7b9));
  box(officeGroup,5.4,1.12,1.3,.72,.08,.57,mat(0x53647c));
  // ping pong table
  box(officeGroup,3.6,.75,3.65,1.65,.09,.9,mat(0x4b9d91));
  box(officeGroup,3.6,.83,3.65,.025,.13,.9,mat(0xffffff));
  for(const x of [3.0,4.2]) for(const z of [3.35,3.95]) box(officeGroup,x,.35,z,.055,.7,.055,mat(0x657187));
  box(officeGroup,3.6,.88,3.65,1.65,.13,.025,mat(0xffffff));
  // plants
  for(const [x,z] of [[-5.6,-3.5],[1.3,-3.6],[-5.5,3.5],[5.8,-3.5]]) {
    const pot=new THREE.Mesh(new THREE.CylinderGeometry(.18,.14,.28,12),mat(0xc49b79)); pot.position.set(x,.14,z); officeGroup.add(pot);
    const leaves=new THREE.Mesh(new THREE.SphereGeometry(.32,12,10),mat(0x5d9d7b)); leaves.position.set(x,.55,z); leaves.scale.y=1.3; officeGroup.add(leaves);
  }
  // transparent windows along back wall
  for(let i=0;i<4;i++) box(officeGroup,-4.8+i*1.5,1.45,-4.31,1.25,1.15,.025,glass,false);
  // people
  const spots={ceo:[-4.6,-1.45],director:[-3.5,-1.45],research:[-.9,-1.45],fact:[.8,-1.45],story:[3.45,-1.45],script:[4.95,-1.45],editor:[-4.9,3.15],qc:[-3.3,3.15],artist:[3.0,2.25],animator:[4.2,2.7],voice:[4.9,2.0]};
  employees.forEach(e=>makePerson(officeGroup,e,...spots[e.id]));
  // light decorative floor strips
  box(officeGroup,0,.015,0,12.3,.02,.035,accent,false);
  camera.lookAt(0,.3,0);
  loading.style.display="none";
  animate();
}
function animate(){
  requestAnimationFrame(animate);
  const t=clock.getElapsedTime();
  agentMeshes.forEach((m,i)=>{
    const e=employees.find(x=>x.id===m.userData.employeeId);
    const idle=e.status==="resting";
    m.position.y=idle?Math.sin(t*1.7+i)*.018:Math.sin(t*2+i)*.008;
    if(e.id==="animator" && idle) m.rotation.y=Math.sin(t*.8)*.12;
  });
  controls.update(); renderer.render(scene,camera);
}
function resize(){
  if(!renderer)return;
  const w=canvasHost.clientWidth,h=canvasHost.clientHeight;
  camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);
}
function focusRoom(room){
  activeRoom=room;
  document.querySelectorAll(".room-item").forEach(b=>b.classList.toggle("selected",b.dataset.room===room));
  const positions={all:[10,10,13],executive:[-4,6,5],research:[0,6,5],creative:[4,6,5],production:[-4,6,5],lounge:[4,6,5]};
  const p=positions[room]||positions.all;
  camera.position.set(...p);controls.target.set(room==="all"?0:room==="executive"?-4:room==="research"?0:room==="creative"?4:room==="production"?-4:4,.35,room==="all"?0:room==="executive"?-2:room==="research"?-2:room==="creative"?-2:room==="production"?2:2.5);
}
function showAgent(employee){
  document.getElementById("modal-avatar").textContent=employee.initial;
  document.getElementById("modal-name").textContent=employee.name;
  document.getElementById("modal-role").textContent=employee.role;
  const statusText=employee.status==="working"?"● Sedang bekerja":employee.status==="resting"?"● Sedang istirahat":"● Siaga";
  document.getElementById("modal-status").textContent=statusText;
  document.getElementById("modal-personality").textContent=employee.personality;
  document.getElementById("modal-activity").textContent=employee.activity;
  document.getElementById("modal-break").textContent=employee.break;
  document.getElementById("agent-modal").classList.add("open");
}
function renderEmployees(){
  const host=document.getElementById("employee-grid");
  host.innerHTML="";
  employees.forEach(e=>host.appendChild(employeeCard(e)));
  document.getElementById("stat-total").textContent=employees.length;
  document.getElementById("stat-working").textContent=employees.filter(e=>e.status==="working").length;
  document.getElementById("stat-resting").textContent=employees.filter(e=>e.status==="resting").length;
}
function employeeCard(e){
  const el=document.createElement("div");el.className="employee-card";
  const status=e.status==="working"?"work":e.status==="resting"?"rest":"idle";
  const label=e.status==="working"?"● Bekerja":e.status==="resting"?"● Istirahat":"● Siaga";
  el.innerHTML=`<div class="employee-avatar">${e.initial}</div><div class="employee-meta"><b>${e.name}</b><small>${e.role}</small><span class="employee-status ${status}">${label}</span></div>`;
  el.addEventListener("click",()=>showAgent(e));return el;
}
function switchView(view){
  const titles={office:"Kantor Virtual",employees:"Karyawan AI",production:"Produksi Konten",core:"NEXORA Core System",brain:"AI Brain System","ai-lab":"AI Agent Lab",autonomous:"Autonomous Studio","production-control":"Production Control",cloud:"Cloud Center",composer:"Video Composer",media:"AI Media Lab",video:"AI Video Lab",voice:"Voice Studio",trends:"Global Trends",knowledge:"Knowledge Center",memory:"CEO Memory"};
  const subtitles={office:"Lihat suasana kantor NEXORA STUDIO dalam bentuk 3D.",employees:"Kelola profil, kepribadian, dan status seluruh Agent.",production:"Pantau proyek dan tahapan produksi konten.",trends:"Temukan topik yang sedang ramai dibicarakan.",knowledge:"Materi referensi yang diberikan oleh pemilik perusahaan.",memory:"Pengetahuan dan pengalaman jangka panjang perusahaan."};
  document.getElementById("page-title").textContent=titles[view]|| (view==="styles"?"Style Studio":titles.office);
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  const core=document.getElementById("core-view"); if(core) core.hidden=view!=="core";
  const brain=document.getElementById("brain-view"); if(brain) brain.hidden=view!=="brain";
  const aiLab=document.getElementById("ai-lab-view"); if(aiLab) aiLab.hidden=view!=="ai-lab";
  const autonomous=document.getElementById("autonomous-view"); if(autonomous) autonomous.hidden=view!=="autonomous";
  const composer=document.getElementById("composer-view"); if(composer) composer.hidden=view!=="composer";
  const media=document.getElementById("media-view"); if(media) media.hidden=view!=="media";
  const voice=document.getElementById("voice-view"); if(voice) voice.hidden=view!=="voice";
  const video=document.getElementById("video-view"); if(video) video.hidden=view!=="video";
  const productionControl=document.getElementById("production-control-view"); if(productionControl) productionControl.hidden=view!=="production-control";
  const cloud=document.getElementById("cloud-view"); if(cloud) cloud.hidden=view!=="cloud";
  const office=document.getElementById("main-content"), style=document.getElementById("style-view"), production=document.getElementById("production-view"), team=document.getElementById("employee-view"), memory=document.getElementById("memory-view");
  if(office) office.hidden=view!=="office";
  if(style) style.hidden=view!=="styles";
  if(production) production.hidden=view!=="production";
  if(team) team.hidden=view!=="employees";
  if(memory) memory.hidden=view!=="memory";
  if(view==="employees") renderTeamDirectory();
  if(view==="memory") renderCeoMemory();
}
// v0.5 Employee directory and local CEO Memory.
const TEAM_STATUS_KEY="nexora_v05_team_status";
const CEO_MEMORY_KEY="nexora_v05_ceo_memory";
try { const saved=JSON.parse(localStorage.getItem(TEAM_STATUS_KEY)||"{}"); employees.forEach(e=>{if(saved[e.id])e.status=saved[e.id];}); } catch(e) { console.warn("Team status could not be loaded",e); }
function renderTeamDirectory(){
  const host=document.getElementById("team-grid"); if(!host)return;
  const q=(document.getElementById("team-search")?.value||"").toLowerCase(); host.innerHTML="";
  employees.filter(e=>(e.name+" "+e.role).toLowerCase().includes(q)).forEach(e=>{
    const card=document.createElement("article"); card.className="team-card";
    const state=e.status==="working"?"work":e.status==="resting"?"rest":"idle";
    const stateText=e.status==="working"?"Bekerja":e.status==="resting"?"Istirahat":"Siaga";
    card.innerHTML=`<button class="team-profile-button" type="button"><span class="team-avatar">${e.initial}</span><span class="team-info"><b>${e.name}</b><small>${e.role}</small><span class="employee-status ${state}">● ${stateText}</span></span><span class="team-open">›</span></button><label class="team-status-label" for="team-status-${e.id}">Status simulasi</label><select class="style-input team-status-select" id="team-status-${e.id}"><option value="working">Bekerja</option><option value="resting">Istirahat</option><option value="idle">Siaga</option></select>`;
    card.querySelector(".team-profile-button").addEventListener("click",()=>showAgent(e));
    const select=card.querySelector("select");select.value=e.status;select.addEventListener("change",()=>{e.status=select.value;try{localStorage.setItem(TEAM_STATUS_KEY,JSON.stringify(Object.fromEntries(employees.map(x=>[x.id,x.status]))));}catch(err){}renderTeamDirectory();renderEmployees();});
    host.appendChild(card);
  });
  if(!host.children.length)host.innerHTML='<div class="empty-timeline">Tidak ada karyawan yang cocok dengan pencarian.</div>';
}
function readCeoMemory(){try{return JSON.parse(localStorage.getItem(CEO_MEMORY_KEY)||"[]");}catch(e){return[];}}
function renderCeoMemory(){
  const host=document.getElementById("memory-list");if(!host)return;const items=readCeoMemory();
  document.getElementById("memory-count").textContent=`${items.length} CATATAN`;
  if(!items.length){host.innerHTML='<div class="empty-timeline">Belum ada memori. Tambahkan catatan pertama.</div>';return;}
  host.innerHTML="";items.slice().reverse().forEach(item=>{const row=document.createElement("article");row.className="memory-item";const title=document.createElement("b"),cat=document.createElement("span"),body=document.createElement("p"),date=document.createElement("small"),del=document.createElement("button");title.textContent=item.title;cat.textContent=item.category;body.textContent=item.body;date.textContent=new Date(item.createdAt).toLocaleString("id-ID");del.type="button";del.className="memory-delete";del.textContent="Hapus";del.addEventListener("click",()=>{const next=readCeoMemory().filter(x=>x.id!==item.id);localStorage.setItem(CEO_MEMORY_KEY,JSON.stringify(next));renderCeoMemory();});row.append(cat,title,body,date,del);host.appendChild(row);});
}
document.getElementById("team-search")?.addEventListener("input",renderTeamDirectory);
document.getElementById("memory-form")?.addEventListener("submit",e=>{e.preventDefault();const title=document.getElementById("memory-title").value.trim(),body=document.getElementById("memory-body").value.trim();if(!title||!body)return;const items=readCeoMemory();items.push({id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),category:document.getElementById("memory-category").value,title,body,createdAt:new Date().toISOString()});try{localStorage.setItem(CEO_MEMORY_KEY,JSON.stringify(items));e.target.reset();renderCeoMemory();}catch(err){alert("Penyimpanan browser penuh atau tidak tersedia. Coba hapus beberapa catatan.");}});

function updateClock(){
  const now=new Date();
  document.getElementById("clock").textContent=now.toLocaleTimeString("id-ID",{hour12:false});
  document.getElementById("date-label").textContent=now.toLocaleDateString("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
}
canvasHost.addEventListener("pointerdown",()=>{});
function rendererSafeInit(){
  try{buildOffice();}catch(err){console.error(err);loading.innerHTML="<span>3D belum dapat dimuat. Periksa koneksi internet lalu muat ulang.</span>";}
}
document.querySelectorAll(".room-item").forEach(b=>b.addEventListener("click",()=>focusRoom(b.dataset.room)));
document.querySelectorAll(".nav-item,[data-view]").forEach(b=>b.addEventListener("click",()=>switchView(b.dataset.view)));
document.getElementById("reset-camera").addEventListener("click",()=>focusRoom("all"));
document.getElementById("toggle-labels").addEventListener("click",e=>{showLabels=!showLabels;labelGroup.visible=showLabels;e.currentTarget.textContent=showLabels?"Sembunyikan label":"Tampilkan label";});
document.getElementById("modal-close").addEventListener("click",()=>document.getElementById("agent-modal").classList.remove("open"));
document.getElementById("agent-modal").addEventListener("click",e=>{if(e.target.id==="agent-modal")e.currentTarget.classList.remove("open");});
rendererSafeInit();
canvasHost.addEventListener("click",event=>{
  if(!renderer)return;
  const rect=renderer.domElement.getBoundingClientRect();
  pointer.x=((event.clientX-rect.left)/rect.width)*2-1;
  pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;
  raycaster.setFromCamera(pointer,camera);
  const hits=raycaster.intersectObjects(agentMeshes,true);
  if(hits.length){
    let obj=hits[0].object;
    while(obj && !obj.userData.employeeId)obj=obj.parent;
    if(obj){const employee=employees.find(e=>e.id===obj.userData.employeeId);if(employee)showAgent(employee);}
  }
});
window.addEventListener("resize",resize);
updateClock();setInterval(updateClock,1000);renderEmployees();

// Style Engine UI prototype: catalog, mode selection and editable scene plan.
const visualStyles = [
  {name:"2D Cartoon",type:"2D",category:"2D",icon:"🎨",desc:"Kartun ekspresif",bg:"linear-gradient(135deg,#ffe1c7,#f6b5a9)"},
  {name:"2D Anime",type:"2D",category:"2D",icon:"🌸",desc:"Ilustrasi anime",bg:"linear-gradient(135deg,#f8d9ee,#c8d8ff)"},
  {name:"Comic Art",type:"2D",category:"2D",icon:"💥",desc:"Panel komik dramatis",bg:"linear-gradient(135deg,#ffe89c,#ffb7a7)"},
  {name:"Storybook",type:"2D",category:"2D",icon:"📖",desc:"Buku cerita ilustratif",bg:"linear-gradient(135deg,#d9edcf,#f7e4b9)"},
  {name:"Silhouette",type:"2D",category:"2D",icon:"🌘",desc:"Siluet dan bayangan",bg:"linear-gradient(135deg,#c9d1e6,#7783a9)"},
  {name:"3D Animation",type:"3D",category:"3D",icon:"🧸",desc:"Karakter animasi 3D",bg:"linear-gradient(135deg,#d6e9ff,#b6c5f7)"},
  {name:"3D Realistic",type:"3D",category:"3D",icon:"🏞️",desc:"Rekonstruksi realistis",bg:"linear-gradient(135deg,#c8e4df,#a9c5b8)"},
  {name:"Voxel Art",type:"3D",category:"3D",icon:"🧊",desc:"Dunia balok 3D",bg:"linear-gradient(135deg,#d6e9d0,#b6d8d7)"},
  {name:"Low Poly",type:"3D",category:"3D",icon:"🔷",desc:"Geometri poligon",bg:"linear-gradient(135deg,#d9ddff,#b9c5ee)"},
  {name:"Wayang",type:"TRADITIONAL",category:"Traditional",icon:"🎭",desc:"Terinspirasi seni wayang",bg:"linear-gradient(135deg,#f3d6a6,#d5a16c)"},
  {name:"Batik Illustration",type:"TRADITIONAL",category:"Traditional",icon:"🪷",desc:"Motif batik dekoratif",bg:"linear-gradient(135deg,#f5dfc5,#d9b6a4)"},
  {name:"Shadow Puppet",type:"TRADITIONAL",category:"Traditional",icon:"🪔",desc:"Teater bayangan",bg:"linear-gradient(135deg,#f6df9e,#8e6c51)"},
  {name:"Watercolor",type:"ART",category:"Art",icon:"🖌️",desc:"Sapuan cat air",bg:"linear-gradient(135deg,#d7e8f5,#f5d9e2)"},
  {name:"Oil Painting",type:"ART",category:"Art",icon:"🖼️",desc:"Tekstur cat minyak",bg:"linear-gradient(135deg,#e6c9a7,#b5c2a1)"},
  {name:"Pencil Sketch",type:"ART",category:"Art",icon:"✏️",desc:"Sketsa pensil",bg:"linear-gradient(135deg,#e7e7e7,#c7cbd2)"},
  {name:"Paper Cutout",type:"ART",category:"Art",icon:"✂️",desc:"Seni potongan kertas",bg:"linear-gradient(135deg,#f5d7c9,#c8d9ef)"},
  {name:"Clay Animation",type:"ART",category:"Art",icon:"🧱",desc:"Tekstur tanah liat",bg:"linear-gradient(135deg,#f2d0b8,#d9b2a2)"},
  {name:"Pixel Art",type:"ART",category:"Art",icon:"👾",desc:"Visual pixel retro",bg:"linear-gradient(135deg,#c9e8d0,#c5c9f1)"}
];
let selectedVisualStyle = null;
let activeStyleMode = "single";
let sceneStylePlan = [];
let activeStyleCategory = "all";
function renderStyleLibrary(){
  const grid=document.getElementById("style-grid"); if(!grid)return;
  const query=(document.getElementById("style-search")?.value||"").toLowerCase();
  const filtered=visualStyles.filter(s=>(activeStyleCategory==="all"||s.category===activeStyleCategory)&&(s.name+" "+s.desc+" "+s.type).toLowerCase().includes(query));
  grid.innerHTML="";
  if(!filtered.length){grid.innerHTML='<div class="no-style-results">Gaya tidak ditemukan. Coba kata kunci lain.</div>';return;}
  filtered.forEach(style=>{
    const card=document.createElement("button");card.className="style-card"+(selectedVisualStyle?.name===style.name?" selected":"");
    const visualClass=style.name.includes("Pixel")?"art-pixel":style.name.includes("Wayang")||style.name.includes("Puppet")?"art-wayang":style.name.includes("Watercolor")?"art-water":style.name.includes("Comic")?"art-comic":style.name.includes("3D")||style.name.includes("Voxel")||style.name.includes("Low Poly")?"art-3d":"art-2d";
    card.innerHTML=`<div class="style-thumb ${visualClass}"><i class="art-sun"></i><i class="art-hill one"></i><i class="art-hill two"></i><i class="art-house"></i><i class="art-person"></i></div><b>${style.name}</b><small>${style.desc}</small><span class="style-type">${style.type}</span>`;
    card.addEventListener("click",()=>{selectedVisualStyle=style;renderStyleLibrary();updateStyleModeLabel();});grid.appendChild(card);
  });
}
function updateStyleModeLabel(){
  const descriptions={single:"Single Style · satu gaya untuk seluruh video",multi:"Multi Style · gabungkan gaya berbeda antaradegan",adaptive:"AI Adaptive · AI akan menyarankan gaya berdasarkan cerita"};
  const label=document.getElementById("active-mode-label");if(label)label.textContent=descriptions[activeStyleMode];
}
function renderStyleTimeline(){
  const host=document.getElementById("style-timeline");if(!host)return;
  if(!sceneStylePlan.length){host.innerHTML='<div class="empty-timeline">Pilih gaya dari katalog untuk mulai menyusun adegan.</div>';return;}
  host.innerHTML="";
  const duration=parseInt(document.getElementById("video-duration")?.value)||60;
  sceneStylePlan.forEach((style,index)=>{
    const start=Math.round(index*duration/sceneStylePlan.length),end=Math.round((index+1)*duration/sceneStylePlan.length);
    const row=document.createElement("div");row.className="timeline-item";
    row.innerHTML=`<div class="timeline-swatch" style="background:${style.bg}">${style.icon}</div><div class="timeline-copy"><b>${style.name}</b><small>Adegan ${index+1} · ${start}–${end} detik</small></div><button class="timeline-remove" aria-label="Hapus gaya">×</button>`;
    row.querySelector("button").addEventListener("click",()=>{sceneStylePlan.splice(index,1);renderStyleTimeline();});host.appendChild(row);
  });
}
function initStyleStudio(){
  if(!document.getElementById("style-grid"))return;
  renderStyleLibrary();updateStyleModeLabel();renderStyleTimeline();
  document.getElementById("style-search").addEventListener("input",renderStyleLibrary);
  document.querySelectorAll(".category-chip").forEach(btn=>btn.addEventListener("click",()=>{activeStyleCategory=btn.dataset.category;document.querySelectorAll(".category-chip").forEach(x=>x.classList.toggle("active",x===btn));renderStyleLibrary();}));
  document.querySelectorAll(".mode-button").forEach(btn=>btn.addEventListener("click",()=>{
    activeStyleMode=btn.dataset.mode;document.querySelectorAll(".mode-button").forEach(x=>x.classList.toggle("active",x===btn));
    if(activeStyleMode==="single"&&sceneStylePlan.length>1)sceneStylePlan=sceneStylePlan.slice(0,1);
    updateStyleModeLabel();renderStyleTimeline();
  }));
  document.getElementById("add-scene-style").addEventListener("click",()=>{
    if(!selectedVisualStyle){alert("Pilih salah satu gaya visual dari Style Library terlebih dahulu.");return;}
    if(activeStyleMode==="single")sceneStylePlan=[selectedVisualStyle];else sceneStylePlan.push(selectedVisualStyle);
    renderStyleTimeline();
  });
  document.getElementById("clear-scene-styles").addEventListener("click",()=>{sceneStylePlan=[];renderStyleTimeline();});
  document.getElementById("video-duration").addEventListener("change",renderStyleTimeline);
}
const originalSwitchView=switchView;
switchView=function(view){
  if(view==="styles"){
    document.getElementById("page-title").textContent="Style Studio";
    document.getElementById("main-content").hidden=true;
    document.getElementById("style-view").hidden=false;
    document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
    return;
  }
  document.getElementById("main-content").hidden=false;
  document.getElementById("style-view").hidden=true;
  originalSwitchView(view);
};
initStyleStudio();


// Scene & Character Planner v0.3: local storyboard planning (no AI rendering yet).
const storyboardDraft=[];
let characterDraft=null;
function renderStoryboard(){
 const host=document.getElementById("storyboard-list"); if(!host)return;
 const count=document.getElementById("storyboard-count"); count.textContent=`${storyboardDraft.length} adegan`;
 if(!storyboardDraft.length){host.innerHTML='<div class="empty-timeline">Belum ada adegan. Tambahkan deskripsi untuk mulai menyusun storyboard.</div>';return;}
 host.innerHTML=""; storyboardDraft.forEach((scene,index)=>{const row=document.createElement("article");row.className="storyboard-row";row.innerHTML=`<div class="storyboard-number">${String(index+1).padStart(2,"0")}</div><div class="storyboard-copy"><b>${scene.style}</b><p>${escapeText(scene.description)}</p></div><button type="button" class="timeline-remove" aria-label="Hapus adegan">×</button>`;row.querySelector("button").addEventListener("click",()=>{storyboardDraft.splice(index,1);renderStoryboard();});host.appendChild(row);});
}
function escapeText(value){return String(value).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));}
document.getElementById("add-story-scene")?.addEventListener("click",()=>{const description=document.getElementById("scene-description").value.trim();if(!description){alert("Tulis deskripsi adegan terlebih dahulu.");return;}storyboardDraft.push({description,style:document.getElementById("scene-style-select").value});document.getElementById("scene-description").value="";renderStoryboard();});
document.getElementById("save-character")?.addEventListener("click",()=>{const name=document.getElementById("character-name").value.trim();const look=document.getElementById("character-look").value.trim();if(!name||!look){alert("Isi nama karakter dan ciri visual tetapnya.");return;}characterDraft={name,look};document.getElementById("character-status").textContent=`Draft karakter “${name}” tersimpan di sesi ini. Ciri visual: ${look}`;});
