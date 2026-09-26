
const JSON_HEADERS={"Content-Type":"application/json; charset=utf-8"};

export default{
 async fetch(request,env){
  const url=new URL(request.url);
  const cors={"Access-Control-Allow-Origin":env.FRONTEND_ORIGIN||"*","Access-Control-Allow-Headers":"Authorization, Content-Type","Access-Control-Allow-Methods":"GET, POST, PATCH, OPTIONS","Vary":"Origin"};
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  try{
   if(request.method==="GET"&&url.pathname==="/api/health")
    return json({ok:true,service:"living-frame-backend",runtime:"cloudflare-workers",version:"2.0.0"},200,cors);

   if(request.method==="GET"&&url.pathname==="/api/public/config")
    return json({supabase_url:env.SUPABASE_URL,supabase_publishable_key:env.SUPABASE_ANON_KEY},200,cors);

   const pub=url.pathname.match(/^\/api\/public\/frames\/([^/]+)$/);
   if(request.method==="GET"&&pub){
    const code=decodeURIComponent(pub[1]).toUpperCase();
    const r=await fetch(`${env.SUPABASE_URL}/rest/v1/frames?frame_code=eq.${encodeURIComponent(code)}&select=frame_code,status,ar_provider,ar_experience_url&limit=1`,{headers:svc(env)});
    if(!r.ok)return json({error:"Database lookup failed",detail:await r.text()},500,cors);
    const rows=await r.json(),f=rows?.[0]; if(!f)return json({error:"Frame not found"},404,cors);
    return json({...f,ar_ready:Boolean(f.ar_experience_url)},200,cors);
   }

   if(request.method==="GET"&&url.pathname==="/api/admin/frames"){
    const admin=await requireAdmin(request,env); if(!admin.ok)return json({error:admin.error},admin.status,cors);
    const r=await fetch(`${env.SUPABASE_URL}/rest/v1/frames?select=id,frame_code,user_id,title,status,photo_path,video_path,ar_provider,ar_target_id,ar_experience_url,customer_name,customer_email,admin_notes,created_at,updated_at&order=created_at.desc`,{headers:svc(env)});
    if(!r.ok)return json({error:"Could not load frames",detail:await r.text()},500,cors);
    const rows=await r.json();
    const frames=await Promise.all(rows.map(async f=>({...f,
      photo_url:f.photo_path?await sign(env,env.PHOTO_BUCKET||"living-frame-photos",f.photo_path):null,
      video_url:f.video_path?await sign(env,env.VIDEO_BUCKET||"living-frame-videos",f.video_path):null
    })));
    return json({frames},200,cors);
   }

   const adm=url.pathname.match(/^\/api\/admin\/frames\/([^/]+)$/);
   if(request.method==="PATCH"&&adm){
    const admin=await requireAdmin(request,env); if(!admin.ok)return json({error:admin.error},admin.status,cors);
    const id=decodeURIComponent(adm[1]),body=await request.json().catch(()=>({}));
    const allowed=new Set(["draft","assets_uploaded","awaiting_ar_setup","ar_configured","ready_to_print","printed","shipped","ready","failed","archived"]);
    if(body.status&&!allowed.has(body.status))return json({error:"Invalid status"},400,cors);
    if(body.ar_experience_url){
      let u;try{u=new URL(body.ar_experience_url)}catch{return json({error:"Invalid ar_experience_url"},400,cors)}
      if(u.protocol!=="https:")return json({error:"AR URL must use HTTPS"},400,cors);
    }
    const patch={updated_at:new Date().toISOString()};
    for(const k of ["status","ar_provider","ar_experience_url","admin_notes"])if(Object.prototype.hasOwnProperty.call(body,k))patch[k]=body[k];
    const r=await fetch(`${env.SUPABASE_URL}/rest/v1/frames?id=eq.${encodeURIComponent(id)}`,{method:"PATCH",headers:{...svc(env),"Content-Type":"application/json","Prefer":"return=representation"},body:JSON.stringify(patch)});
    if(!r.ok)return json({error:"Could not update frame",detail:await r.text()},500,cors);
    const rows=await r.json();return json(rows?.[0]||{ok:true},200,cors);
   }

   const ar=url.pathname.match(/^\/api\/frames\/([^/]+)\/ar$/);
   if(request.method==="PATCH"&&ar){
    const id=decodeURIComponent(ar[1]),user=await requireUser(request,env);if(!user.ok)return json({error:user.error},user.status,cors);
    const b=await request.json().catch(()=>({})),arUrl=b.ar_experience_url||null;
    if(arUrl){let u;try{u=new URL(arUrl)}catch{return json({error:"Invalid ar_experience_url"},400,cors)}if(u.protocol!=="https:")return json({error:"ar_experience_url must use HTTPS"},400,cors)}
    const own=await fetch(`${env.SUPABASE_URL}/rest/v1/frames?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.data.id)}&select=id&limit=1`,{headers:svc(env)});
    if(!own.ok)return json({error:"Ownership check failed"},500,cors);const o=await own.json();if(!o?.length)return json({error:"Frame not found"},404,cors);
    const r=await fetch(`${env.SUPABASE_URL}/rest/v1/frames?id=eq.${encodeURIComponent(id)}`,{method:"PATCH",headers:{...svc(env),"Content-Type":"application/json","Prefer":"return=representation"},body:JSON.stringify({ar_provider:b.ar_provider||null,ar_target_id:b.ar_target_id||null,ar_experience_url:arUrl,updated_at:new Date().toISOString()})});
    if(!r.ok)return json({error:"Failed to update AR mapping",detail:await r.text()},500,cors);const rows=await r.json();return json(rows?.[0]||{ok:true},200,cors);
   }

   return json({error:"Not found"},404,cors);
  }catch(err){return json({error:"Internal server error",detail:err?.message||String(err)},500,cors)}
 }
};

function json(data,status,cors={}){return new Response(JSON.stringify(data,null,2),{status,headers:{...JSON_HEADERS,...cors}})}
function svc(env){return {"apikey":env.SUPABASE_SERVICE_ROLE_KEY}}
async function requireUser(request,env){
 const auth=request.headers.get("Authorization")||"",m=auth.match(/^Bearer\s+(.+)$/i);if(!m)return{ok:false,status:401,error:"Missing bearer token"};
 const r=await fetch(`${env.SUPABASE_URL}/auth/v1/user`,{headers:{"apikey":env.SUPABASE_ANON_KEY,"Authorization":`Bearer ${m[1]}`}});
 if(!r.ok)return{ok:false,status:401,error:"Invalid or expired token"};return{ok:true,data:await r.json()};
}
async function requireAdmin(request,env){
 const u=await requireUser(request,env);if(!u.ok)return u;
 if(!env.ADMIN_USER_ID||env.ADMIN_USER_ID==="YOUR_ADMIN_SUPABASE_USER_ID")return{ok:false,status:500,error:"ADMIN_USER_ID is not configured"};
 if(u.data.id!==env.ADMIN_USER_ID)return{ok:false,status:403,error:"Admin access required"};return u;
}
async function sign(env,bucket,path){
 const encoded=path.split("/").map(encodeURIComponent).join("/");
 const r=await fetch(`${env.SUPABASE_URL}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encoded}`,{method:"POST",headers:{...svc(env),"Content-Type":"application/json"},body:JSON.stringify({expiresIn:3600})});
 if(!r.ok)return null;const d=await r.json(),s=d.signedURL||d.signedUrl||d.signed_url;if(!s)return null;return s.startsWith("http")?s:`${env.SUPABASE_URL}/storage/v1${s}`;
}
