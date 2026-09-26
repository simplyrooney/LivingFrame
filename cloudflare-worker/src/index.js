const JSON_HEADERS={"Content-Type":"application/json; charset=utf-8"};

export default{
 async fetch(request,env){
  const url=new URL(request.url);
  const origin=request.headers.get("Origin")||"";
  const allowedOrigin=(origin==="https://living-frame.pages.dev"||/^https:\/\/[a-z0-9-]+\.living-frame\.pages\.dev$/i.test(origin))?origin:env.FRONTEND_ORIGIN;
  const cors={"Access-Control-Allow-Origin":allowedOrigin||"*","Access-Control-Allow-Headers":"Authorization, Content-Type","Access-Control-Allow-Methods":"GET, POST, PATCH, OPTIONS","Access-Control-Expose-Headers":"Content-Disposition, Content-Type","Vary":"Origin"};
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors});

  try{
   if(request.method==="GET"&&url.pathname==="/api/health")
    return json({ok:true,service:"living-frame-backend",runtime:"cloudflare-workers",version:"3.0.0"},200,cors);

   if(request.method==="GET"&&url.pathname==="/api/public/config")
    return json({supabase_url:env.SUPABASE_URL,supabase_publishable_key:env.SUPABASE_ANON_KEY},200,cors);

   // CUSTOMER ORDER: create a guest draft and signed upload URLs.
   if(request.method==="POST"&&url.pathname==="/api/public/orders/draft"){
    const b=await request.json().catch(()=>({}));
    validateDraft(b);

    const orderId=crypto.randomUUID();
    const orderToken=crypto.randomUUID();
    const orderNumber=`LF-ORD-${randomCode(8)}`;
    const customerId=`CUST-${randomCode(8)}`;
    const frameCode=`LF-${randomCode(8)}`;
    const photoExt=safeExt(b.photo.ext,"jpg");
    const videoExt=safeExt(b.video.ext,"mp4");
    const photoPath=`orders/${customerId}/${orderNumber}/photo.${photoExt}`;
    const videoPath=`orders/${customerId}/${orderNumber}/video.${videoExt}`;

    const orderRow={
      id:orderId,order_number:orderNumber,customer_id:customerId,order_token:orderToken,
      frame_code:frameCode,status:"draft",payment_status:"pending",
      frame_variant:b.frame_variant,frame_size:b.frame_size,
      photo_path:photoPath,video_path:videoPath
    };

    const oi=await rest(env,"orders","POST",orderRow,"return=minimal");
    if(!oi.ok)return json({error:"Could not create order",detail:await oi.text()},500,cors);

    const frameRow={
      frame_code:frameCode,title:`Living Frame ${orderNumber}`,status:"draft",
      customer_id:customerId,photo_path:photoPath,video_path:videoPath
    };
    const fi=await rest(env,"frames","POST",frameRow,"return=representation");
    if(!fi.ok)return json({error:"Could not create frame",detail:await fi.text()},500,cors);
    const frames=await fi.json();
    const frameId=frames?.[0]?.id||null;

    await fetch(`${env.SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`,{
      method:"PATCH",headers:{...svc(env),"Content-Type":"application/json","Prefer":"return=minimal"},
      body:JSON.stringify({frame_id:frameId})
    });

    const photoUpload=await createSignedUpload(env,env.PHOTO_BUCKET||"living-frame-photos",photoPath);
    const videoUpload=await createSignedUpload(env,env.VIDEO_BUCKET||"living-frame-videos",videoPath);
    if(!photoUpload||!videoUpload)return json({error:"Could not prepare file uploads"},500,cors);

    return json({
      order_id:orderId,order_token:orderToken,order_number:orderNumber,
      customer_id:customerId,frame_code:frameCode,
      photo_upload_url:photoUpload,video_upload_url:videoUpload
    },201,cors);
   }

   const assets=url.pathname.match(/^\/api\/public\/orders\/([^/]+)\/assets-complete$/);
   if(request.method==="POST"&&assets){
    const orderId=decodeURIComponent(assets[1]),b=await request.json().catch(()=>({}));
    const order=await requireOrderToken(env,orderId,b.order_token);
    if(!order.ok)return json({error:order.error},order.status,cors);

    await patchOrder(env,orderId,{status:"assets_uploaded"});
    if(order.data.frame_id)await patchFrame(env,order.data.frame_id,{status:"assets_uploaded"});
    return json({ok:true,status:"assets_uploaded"},200,cors);
   }

   const delivery=url.pathname.match(/^\/api\/public\/orders\/([^/]+)\/delivery$/);
   if(request.method==="PATCH"&&delivery){
    const orderId=decodeURIComponent(delivery[1]),b=await request.json().catch(()=>({}));
    const order=await requireOrderToken(env,orderId,b.order_token);
    if(!order.ok)return json({error:order.error},order.status,cors);
    validateDelivery(b);

    const patch={
      customer_name:clean(b.customer_name,120),
      customer_email:clean(b.customer_email,180),
      phone:clean(b.phone,40),
      address_line1:clean(b.address_line1,240),
      address_line2:clean(b.address_line2||"",240)||null,
      city:clean(b.city,100),state:clean(b.state,100),
      postal_code:clean(b.postal_code,20),country:clean(b.country,80),
      status:"delivery_complete"
    };
    await patchOrder(env,orderId,patch);
    if(order.data.frame_id)await patchFrame(env,order.data.frame_id,{
      customer_name:patch.customer_name,customer_email:patch.customer_email,
      status:"assets_uploaded"
    });
    return json({ok:true,status:"delivery_complete",payment_status:"pending"},200,cors);
   }

   // Existing public AR lookup.
   const pub=url.pathname.match(/^\/api\/public\/frames\/([^/]+)$/);
   if(request.method==="GET"&&pub){
    const code=decodeURIComponent(pub[1]).toUpperCase();
    const r=await fetch(`${env.SUPABASE_URL}/rest/v1/frames?frame_code=eq.${encodeURIComponent(code)}&select=frame_code,status,ar_provider,ar_experience_url&limit=1`,{headers:svc(env)});
    if(!r.ok)return json({error:"Database lookup failed",detail:await r.text()},500,cors);
    const rows=await r.json(),f=rows?.[0];if(!f)return json({error:"Frame not found"},404,cors);
    return json({...f,ar_ready:Boolean(f.ar_experience_url)},200,cors);
   }

   // Existing admin frame listing.
   if(request.method==="GET"&&url.pathname==="/api/admin/frames"){
    const admin=await requireAdmin(request,env);if(!admin.ok)return json({error:admin.error},admin.status,cors);
    const r=await fetch(`${env.SUPABASE_URL}/rest/v1/frames?select=id,frame_code,user_id,customer_id,title,status,photo_path,video_path,ar_provider,ar_target_id,ar_experience_url,customer_name,customer_email,admin_notes,created_at,updated_at&order=created_at.desc`,{headers:svc(env)});
    if(!r.ok)return json({error:"Could not load frames",detail:await r.text()},500,cors);
    const rows=await r.json();
    const frames=await Promise.all(rows.map(async f=>({...f,
      photo_url:f.photo_path?await sign(env,env.PHOTO_BUCKET||"living-frame-photos",f.photo_path):null,
      video_url:f.video_path?await sign(env,env.VIDEO_BUCKET||"living-frame-videos",f.video_path):null
    })));
    return json({frames},200,cors);
   }

   const dl=url.pathname.match(/^\/api\/admin\/frames\/([^/]+)\/download\/(photo|video)$/);
   if(request.method==="GET"&&dl){
    const admin=await requireAdmin(request,env);if(!admin.ok)return json({error:admin.error},admin.status,cors);
    const frameId=decodeURIComponent(dl[1]),kind=dl[2];
    const r=await fetch(`${env.SUPABASE_URL}/rest/v1/frames?id=eq.${encodeURIComponent(frameId)}&select=id,frame_code,customer_id,created_at,photo_path,video_path&limit=1`,{headers:svc(env)});
    if(!r.ok)return json({error:"Could not load frame",detail:await r.text()},500,cors);
    const rows=await r.json(),f=rows?.[0];if(!f)return json({error:"Frame not found"},404,cors);
    const path=kind==="photo"?f.photo_path:f.video_path;if(!path)return json({error:`No ${kind} uploaded for this frame`},404,cors);
    const bucket=kind==="photo"?(env.PHOTO_BUCKET||"living-frame-photos"):(env.VIDEO_BUCKET||"living-frame-videos");
    const signed=await sign(env,bucket,path);if(!signed)return json({error:"Could not create download URL"},500,cors);
    const asset=await fetch(signed);if(!asset.ok)return json({error:"Could not download stored file"},502,cors);
    const customerId=safeFilenamePart(f.customer_id||f.frame_code||"Customer");
    const date=formatDDMMYYYY(f.created_at),ext=getExtension(path,kind==="photo"?"jpg":"mp4"),label=kind==="photo"?"Photo":"Video";
    const filename=`${customerId}_${date}_${label}.${ext}`;
    const headers=new Headers(cors);headers.set("Content-Type",asset.headers.get("Content-Type")||"application/octet-stream");
    headers.set("Content-Disposition",`attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    headers.set("Cache-Control","private, no-store");
    return new Response(asset.body,{status:200,headers});
   }

   const adm=url.pathname.match(/^\/api\/admin\/frames\/([^/]+)$/);
   if(request.method==="PATCH"&&adm){
    const admin=await requireAdmin(request,env);if(!admin.ok)return json({error:admin.error},admin.status,cors);
    const id=decodeURIComponent(adm[1]),body=await request.json().catch(()=>({}));
    const allowed=new Set(["draft","assets_uploaded","awaiting_ar_setup","ar_configured","ready_to_print","printed","shipped","ready","failed","archived"]);
    if(body.status&&!allowed.has(body.status))return json({error:"Invalid status"},400,cors);
    if(body.ar_experience_url){let u;try{u=new URL(body.ar_experience_url)}catch{return json({error:"Invalid ar_experience_url"},400,cors)}if(u.protocol!=="https:")return json({error:"AR URL must use HTTPS"},400,cors)}
    const patch={updated_at:new Date().toISOString()};
    for(const k of ["status","ar_provider","ar_experience_url","admin_notes"])if(Object.prototype.hasOwnProperty.call(body,k))patch[k]=body[k];
    const r=await fetch(`${env.SUPABASE_URL}/rest/v1/frames?id=eq.${encodeURIComponent(id)}`,{method:"PATCH",headers:{...svc(env),"Content-Type":"application/json","Prefer":"return=representation"},body:JSON.stringify(patch)});
    if(!r.ok)return json({error:"Could not update frame",detail:await r.text()},500,cors);
    const rows=await r.json();return json(rows?.[0]||{ok:true},200,cors);
   }

   return json({error:"Not found"},404,cors);
  }catch(err){return json({error:"Internal server error",detail:err?.message||String(err)},500,cors)}
 }
};

function json(data,status,cors={}){return new Response(JSON.stringify(data,null,2),{status,headers:{...JSON_HEADERS,...cors}})}
function svc(env){return {"apikey":env.SUPABASE_SERVICE_ROLE_KEY}}
function randomCode(n){const a="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";const b=new Uint8Array(n);crypto.getRandomValues(b);return Array.from(b,x=>a[x%a.length]).join("")}
function safeExt(v,fallback){const e=String(v||"").toLowerCase().replace(/[^a-z0-9]/g,"");return e&&e.length<=8?e:fallback}
function clean(v,max){return String(v??"").trim().slice(0,max)}
function validateDraft(b){
 if(!["classic-black","natural-oak","gallery-white"].includes(b.frame_variant))throw new Error("Invalid frame selection");
 if(!["8x10","12x16"].includes(b.frame_size))throw new Error("Invalid frame size");
 if(!b.photo||!b.video)throw new Error("Photo and video are required");
 if(Number(b.photo.size)>20*1024*1024)throw new Error("Photo is too large");
 if(Number(b.video.size)>100*1024*1024)throw new Error("Video is too large");
}
function validateDelivery(b){
 for(const k of ["customer_name","customer_email","phone","address_line1","city","state","postal_code","country"])
   if(!clean(b[k],240))throw new Error(`Missing ${k}`);
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(b.customer_email)))throw new Error("Invalid email");
}
async function rest(env,table,method,body,prefer){
 return fetch(`${env.SUPABASE_URL}/rest/v1/${table}`,{method,headers:{...svc(env),"Content-Type":"application/json","Prefer":prefer},body:JSON.stringify(body)});
}
async function createSignedUpload(env,bucket,path){
 const encoded=path.split("/").map(encodeURIComponent).join("/");
 const r=await fetch(`${env.SUPABASE_URL}/storage/v1/object/upload/sign/${encodeURIComponent(bucket)}/${encoded}`,{
   method:"POST",headers:{...svc(env),"Content-Type":"application/json"},body:"{}"
 });
 if(!r.ok)return null;const d=await r.json();
 if(d.url){return d.url.startsWith("http")?d.url:`${env.SUPABASE_URL}/storage/v1${d.url}`}
 if(d.signedURL)return d.signedURL.startsWith("http")?d.signedURL:`${env.SUPABASE_URL}/storage/v1${d.signedURL}`;
 return null;
}
async function requireOrderToken(env,id,token){
 if(!token)return{ok:false,status:401,error:"Missing order token"};
 const r=await fetch(`${env.SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(id)}&order_token=eq.${encodeURIComponent(token)}&select=*&limit=1`,{headers:svc(env)});
 if(!r.ok)return{ok:false,status:500,error:"Order lookup failed"};
 const rows=await r.json();if(!rows?.length)return{ok:false,status:403,error:"Invalid order token"};
 return{ok:true,data:rows[0]};
}
async function patchOrder(env,id,patch){
 return fetch(`${env.SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(id)}`,{method:"PATCH",headers:{...svc(env),"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify({...patch,updated_at:new Date().toISOString()})});
}
async function patchFrame(env,id,patch){
 return fetch(`${env.SUPABASE_URL}/rest/v1/frames?id=eq.${encodeURIComponent(id)}`,{method:"PATCH",headers:{...svc(env),"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify({...patch,updated_at:new Date().toISOString()})});
}
async function requireUser(request,env){
 const auth=request.headers.get("Authorization")||"",m=auth.match(/^Bearer\s+(.+)$/i);if(!m)return{ok:false,status:401,error:"Missing bearer token"};
 const r=await fetch(`${env.SUPABASE_URL}/auth/v1/user`,{headers:{"apikey":env.SUPABASE_ANON_KEY,"Authorization":`Bearer ${m[1]}`}});
 if(!r.ok)return{ok:false,status:401,error:"Invalid or expired token"};return{ok:true,data:await r.json()};
}
async function requireAdmin(request,env){const u=await requireUser(request,env);if(!u.ok)return u;if(!env.ADMIN_USER_ID)return{ok:false,status:500,error:"ADMIN_USER_ID is not configured"};if(u.data.id!==env.ADMIN_USER_ID)return{ok:false,status:403,error:"Admin access required"};return u}
async function sign(env,bucket,path){
 const encoded=path.split("/").map(encodeURIComponent).join("/");
 const r=await fetch(`${env.SUPABASE_URL}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encoded}`,{method:"POST",headers:{...svc(env),"Content-Type":"application/json"},body:JSON.stringify({expiresIn:3600})});
 if(!r.ok)return null;const d=await r.json(),s=d.signedURL||d.signedUrl||d.signed_url;if(!s)return null;return s.startsWith("http")?s:`${env.SUPABASE_URL}/storage/v1${s}`;
}
function formatDDMMYYYY(value){const d=value?new Date(value):new Date();return `${String(d.getUTCDate()).padStart(2,"0")}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${d.getUTCFullYear()}`}
function getExtension(path,fallback){const m=((path||"").split("/").pop()||"").match(/\.([A-Za-z0-9]{1,8})$/);return(m?m[1]:fallback).toLowerCase()}
function safeFilenamePart(value){return String(value||"Customer").trim().replace(/[^A-Za-z0-9_-]+/g,"-").replace(/^-+|-+$/g,"")||"Customer"}
