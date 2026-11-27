import { timingSafeEqual, randomUUID } from 'node:crypto';
const json=(statusCode,body)=>new Response(JSON.stringify(body),{status:statusCode,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
function authorized(value){const expected=process.env.NEXORA_CLOUD_ACCESS_CODE||'';const a=Buffer.from(String(value||''));const b=Buffer.from(expected);return !!expected&&a.length===b.length&&timingSafeEqual(a,b);}
function config(){const url=(process.env.SUPABASE_URL||'').replace(/\/$/,'');const key=process.env.SUPABASE_SERVICE_ROLE_KEY||'';if(!url||!key)throw new Error('SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY harus diatur di Netlify.');return {url,key};}
async function sb(path,{method='GET',body,headers={}}={}){const {url,key}=config();const res=await fetch(`${url}${path}`,{method,headers:{apikey:key,Authorization:`Bearer ${key}`,...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});const data=await res.json().catch(()=>null);if(!res.ok)throw new Error(data?.message||data?.error||`Supabase error ${res.status}`);return data;}
const tables={memory:'nexora_memories',task:'nexora_tasks',log:'nexora_activity_logs',asset:'nexora_assets'};
function cleanText(v,max=5000){return String(v??'').trim().slice(0,max);}
export default async (req)=>{
 if(req.method!=='POST')return json(405,{error:'Method not allowed.'});
 let b;try{b=await req.json();}catch{return json(400,{error:'JSON tidak valid.'});}
 if(!authorized(b.accessCode))return json(401,{error:'Kode akses cloud salah atau belum dikonfigurasi.'});
 try{
  const action=String(b.action||'');
  if(action==='health'){const data=await sb('/rest/v1/nexora_activity_logs?select=id&limit=1');return json(200,{ok:true,message:'Terhubung ke Supabase.',checkedAt:new Date().toISOString()});}
  if(action==='memory.list'||action==='task.list'||action==='log.list'||action==='asset.list'){
   const kind=action.split('.')[0],table=tables[kind];const data=await sb(`/rest/v1/${table}?select=*&order=created_at.desc&limit=200`);return json(200,{items:data||[]});
  }
  if(action==='memory.save'){
   const row={agent_name:cleanText(b.agentName,60)||'Septian',category:cleanText(b.category,80)||'Catatan',title:cleanText(b.title,120),body:cleanText(b.body,12000),updated_at:new Date().toISOString()};if(!row.title||!row.body)return json(400,{error:'Judul dan isi memori wajib diisi.'});
   const data=await sb('/rest/v1/nexora_memories',{method:'POST',body:row,headers:{Prefer:'return=representation'}});return json(200,{item:data?.[0]});
  }
  if(action==='memory.delete'||action==='task.delete'||action==='asset.delete'){
   const kind=action.split('.')[0],table=tables[kind],id=cleanText(b.id,100);if(!id)return json(400,{error:'ID tidak valid.'});
   if(kind==='asset'){const rows=await sb(`/rest/v1/nexora_assets?id=eq.${encodeURIComponent(id)}&select=storage_path`);if(rows?.[0]?.storage_path){const {url,key}=config();await fetch(`${url}/storage/v1/object/nexora-assets/${rows[0].storage_path.split('/').map(encodeURIComponent).join('/')}`,{method:'DELETE',headers:{apikey:key,Authorization:`Bearer ${key}`}});}}
   await sb(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,{method:'DELETE'});return json(200,{ok:true});
  }
  if(action==='task.update'){
   const id=cleanText(b.id,100),status=cleanText(b.status,40);const allowed=new Set(['queued','working','review','approved','revision','completed']);if(!id||!allowed.has(status))return json(400,{error:'ID atau status tugas tidak valid.'});
   const data=await sb(`/rest/v1/nexora_tasks?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:{status,updated_at:new Date().toISOString()},headers:{Prefer:'return=representation'}});return json(200,{item:data?.[0]});
  }
  if(action==='task.save'){
   const row={title:cleanText(b.title,160),agent_name:cleanText(b.agentName,80),status:cleanText(b.status,40)||'queued',details:cleanText(b.details,12000),project_id:cleanText(b.projectId,100)||null,updated_at:new Date().toISOString()};if(!row.title)return json(400,{error:'Judul tugas wajib diisi.'});
   const data=await sb('/rest/v1/nexora_tasks',{method:'POST',body:row,headers:{Prefer:'return=representation'}});return json(200,{item:data?.[0]});
  }
  if(action==='log.add'){
   const row={agent_name:cleanText(b.agentName,80)||'System',event_type:cleanText(b.eventType,80)||'activity',message:cleanText(b.message,3000),metadata:b.metadata&&typeof b.metadata==='object'?b.metadata:{}};
   const data=await sb('/rest/v1/nexora_activity_logs',{method:'POST',body:row,headers:{Prefer:'return=representation'}});return json(200,{item:data?.[0]});
  }
  if(action==='asset.upload'){
   const name=cleanText(b.name,180).replace(/[^\p{L}\p{N}._-]+/gu,'_')||'asset.bin';const mime=cleanText(b.mime,100)||'application/octet-stream';const raw=String(b.base64||'');if(!raw||raw.length>5600000)return json(413,{error:'File kosong atau terlalu besar. Batas unggah sekitar 4 MB.'});
   const bytes=Buffer.from(raw,'base64');if(bytes.length>4*1024*1024)return json(413,{error:'Ukuran aset maksimum 4 MB.'});const path=`${new Date().toISOString().slice(0,10)}/${randomUUID()}-${name}`;const {url,key}=config();
   const up=await fetch(`${url}/storage/v1/object/nexora-assets/${path.split('/').map(encodeURIComponent).join('/')}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':mime,'x-upsert':'false'},body:bytes});const ud=await up.json().catch(()=>({}));if(!up.ok)throw new Error(ud.message||`Upload storage gagal (${up.status}).`);
   const data=await sb('/rest/v1/nexora_assets',{method:'POST',body:{name,mime_type:mime,size_bytes:bytes.length,storage_path:path},headers:{Prefer:'return=representation'}});return json(200,{item:data?.[0]});
  }
  if(action==='asset.download'){
   const id=cleanText(b.id,100);const rows=await sb(`/rest/v1/nexora_assets?id=eq.${encodeURIComponent(id)}&select=*`);const item=rows?.[0];if(!item)return json(404,{error:'Aset tidak ditemukan.'});const {url,key}=config();const signed=await fetch(`${url}/storage/v1/object/sign/nexora-assets/${item.storage_path.split('/').map(encodeURIComponent).join('/')}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({expiresIn:900})});const result=await signed.json().catch(()=>({}));if(!signed.ok)throw new Error(result.message||'Gagal membuat tautan unduh.');return json(200,{url:`${url}/storage/v1${result.signedURL}`,name:item.name,mimeType:item.mime_type});
  }
  return json(400,{error:'Action tidak dikenal.'});
 }catch(e){return json(500,{error:String(e.message||'Cloud operation gagal.').slice(0,400)});}
};
