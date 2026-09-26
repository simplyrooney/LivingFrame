const JSON_HEADERS={"Content-Type":"application/json; charset=utf-8"};

export default{
 async fetch(request,env){
  const url=new URL(request.url);
  const origin=request.headers.get("Origin")||"";
  const allowedOrigin=(origin==="https://living-frame.pages.dev"||/^https:\/\/[a-z0-9-]+\.living-frame\.pages\.dev$/i.test(origin))?origin:env.FRONTEND_ORIGIN;
  const cors={
    "Access-Control-Allow-Origin":allowedOrigin||"*",
    "Access-Control-Allow-Headers":"Authorization, Content-Type, X-Razorpay-Signature",
    "Access-Control-Allow-Methods":"GET, POST, PATCH, OPTIONS",
    "Access-Control-Expose-Headers":"Content-Disposition, Content-Type",
    "Vary":"Origin"
  };
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors});

  try{
   if(request.method==="GET"&&url.pathname==="/api/health")
    return json({ok:true,service:"living-frame-backend",runtime:"cloudflare-workers",version:"4.0.0"},200,cors);

   if(request.method==="GET"&&url.pathname==="/api/public/config")
    return json({supabase_url:env.SUPABASE_URL,supabase_publishable_key:env.SUPABASE_ANON_KEY},200,cors);

   // ---------- CUSTOMER ORDER ----------
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

    // IMPORTANT: no frame/admin fulfilment row is created before payment.
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
    const pr=await patchOrder(env,orderId,patch);
    if(!pr.ok)return json({error:"Could not save delivery details",detail:await pr.text()},500,cors);
    return json({ok:true,status:"delivery_complete",payment_status:"pending"},200,cors);
   }

   // Create Razorpay order from trusted backend price.
   const createPay=url.pathname.match(/^\/api\/public\/orders\/([^/]+)\/payment\/create$/);
   if(request.method==="POST"&&createPay){
    assertRazorpayConfigured(env);
    const orderId=decodeURIComponent(createPay[1]),b=await request.json().catch(()=>({}));
    const order=await requireOrderToken(env,orderId,b.order_token);
    if(!order.ok)return json({error:order.error},order.status,cors);
    const o=order.data;

    if(!["delivery_complete","payment_processing","paid"].includes(o.status))
      return json({error:"Complete delivery details before payment"},409,cors);

    if(o.payment_status==="paid")
      return json({error:"This order is already paid"},409,cors);

    const amount=serverPrice(o.frame_variant,o.frame_size,env);
    if(!amount)return json({error:"Price is not configured for this frame"},500,cors);

    let razorpayOrderId=o.razorpay_order_id;
    if(!razorpayOrderId){
      const rp=await razorpay(env,"/v1/orders","POST",{
        amount,currency:"INR",receipt:o.order_number,
        notes:{living_frame_order_id:o.id,customer_id:o.customer_id,frame_code:o.frame_code}
      });
      if(!rp.ok)return json({error:"Could not create Razorpay order",detail:await rp.text()},502,cors);
      const d=await rp.json();
      razorpayOrderId=d.id;
      await patchOrder(env,o.id,{
        razorpay_order_id:razorpayOrderId,
        price_paise:amount,
        currency:"INR",
        payment_status:"pending",
        status:"payment_processing"
      });
    }

    return json({
      key_id:env.RAZORPAY_KEY_ID,
      razorpay_order_id:razorpayOrderId,
      amount,
      currency:"INR",
      order_number:o.order_number,
      customer_name:o.customer_name,
      customer_email:o.customer_email,
      phone:o.phone
    },200,cors);
   }

   // Checkout signature verification.
   const verifyPay=url.pathname.match(/^\/api\/public\/orders\/([^/]+)\/payment\/verify$/);
   if(request.method==="POST"&&verifyPay){
    assertRazorpayConfigured(env);
    const orderId=decodeURIComponent(verifyPay[1]),b=await request.json().catch(()=>({}));
    const order=await requireOrderToken(env,orderId,b.order_token);
    if(!order.ok)return json({error:order.error},order.status,cors);
    const o=order.data;

    if(!b.razorpay_order_id||!b.razorpay_payment_id||!b.razorpay_signature)
      return json({error:"Incomplete payment response"},400,cors);

    if(o.razorpay_order_id!==b.razorpay_order_id)
      return json({error:"Payment order mismatch"},400,cors);

    const expected=await hmacHex(env.RAZORPAY_KEY_SECRET,`${b.razorpay_order_id}|${b.razorpay_payment_id}`);
    if(!timingSafeEqual(expected,String(b.razorpay_signature)))
      return json({error:"Payment signature verification failed"},400,cors);

    const p=await razorpay(env,`/v1/payments/${encodeURIComponent(b.razorpay_payment_id)}`,"GET");
    if(!p.ok)return json({error:"Could not verify payment status with Razorpay"},502,cors);
    const payment=await p.json();

    const expectedAmount=Number(o.price_paise||serverPrice(o.frame_variant,o.frame_size,env));
    if(payment.order_id!==o.razorpay_order_id||Number(payment.amount)!==expectedAmount||payment.currency!=="INR")
      return json({error:"Payment details do not match this order"},400,cors);

    if(payment.status==="captured"){
      await markOrderPaid(env,o,b.razorpay_payment_id);
      return json({ok:true,payment_status:"paid",status:"paid"},200,cors);
    }

    await patchOrder(env,o.id,{
      razorpay_payment_id:b.razorpay_payment_id,
      payment_status:"processing",
      status:"payment_processing"
    });
    return json({ok:true,payment_status:"processing",status:"payment_processing"},202,cors);
   }

   const statusRoute=url.pathname.match(/^\/api\/public\/orders\/([^/]+)\/status$/);
   if(request.method==="POST"&&statusRoute){
    const orderId=decodeURIComponent(statusRoute[1]),b=await request.json().catch(()=>({}));
    const order=await requireOrderToken(env,orderId,b.order_token);
    if(!order.ok)return json({error:order.error},order.status,cors);
    const o=order.data;
    return json({
  order_number:o.order_number,
  customer_id:o.customer_id,
  frame_code:o.frame_code,
  frame_variant:o.frame_variant,
  frame_size:o.frame_size,

  price_paise:o.price_paise,
  currency:o.currency || "INR",

  payment_status:o.payment_status,
  status:o.status
},200,cors);
   }

   // Razorpay webhook: raw-body HMAC verification.
   if(request.method==="POST"&&url.pathname==="/api/razorpay/webhook"){
    if(!env.RAZORPAY_WEBHOOK_SECRET)return json({error:"Webhook secret not configured"},500,cors);
    const raw=await request.text();
    const sig=request.headers.get("X-Razorpay-Signature")||"";
    const expected=await hmacHex(env.RAZORPAY_WEBHOOK_SECRET,raw);
    if(!timingSafeEqual(expected,sig))return json({error:"Invalid webhook signature"},400,cors);

    let event;try{event=JSON.parse(raw)}catch{return json({error:"Invalid JSON"},400,cors)}
    const payment=event?.payload?.payment?.entity;

    if(payment?.order_id){
      const qr=await fetch(`${env.SUPABASE_URL}/rest/v1/orders?razorpay_order_id=eq.${encodeURIComponent(payment.order_id)}&select=*&limit=1`,{headers:svc(env)});
      if(qr.ok){
        const rows=await qr.json(),o=rows?.[0];
        if(o){
          if(event.event==="payment.captured"){
            const expectedAmount=Number(o.price_paise||serverPrice(o.frame_variant,o.frame_size,env));
            if(Number(payment.amount)===expectedAmount&&payment.currency==="INR")
              await markOrderPaid(env,o,payment.id);
          }else if(event.event==="payment.failed"){
            await patchOrder(env,o.id,{razorpay_payment_id:payment.id,payment_status:"failed",status:"payment_failed"});
          }
        }
      }
    }
    return json({ok:true},200,cors);
   }

   // ---------- EXISTING PUBLIC AR ----------
   const pub=url.pathname.match(/^\/api\/public\/frames\/([^/]+)$/);
   if(request.method==="GET"&&pub){
    const code=decodeURIComponent(pub[1]).toUpperCase();
    const r=await fetch(`${env.SUPABASE_URL}/rest/v1/frames?frame_code=eq.${encodeURIComponent(code)}&select=frame_code,status,ar_provider,ar_experience_url&limit=1`,{headers:svc(env)});
    if(!r.ok)return json({error:"Database lookup failed",detail:await r.text()},500,cors);
    const rows=await r.json(),f=rows?.[0];if(!f)return json({error:"Frame not found"},404,cors);
    return json({...f,ar_ready:Boolean(f.ar_experience_url)},200,cors);
   }

   // ---------- EXISTING ADMIN ----------
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
  }catch(err){
    const status=err?.status||500;
    return json({error:status===500?"Internal server error":err.message,detail:status===500?(err?.message||String(err)):undefined},status,cors)
  }
 }
};

function json(data,status,cors={}){return new Response(JSON.stringify(data,null,2),{status,headers:{...JSON_HEADERS,...cors}})}
function svc(env){return {"apikey":env.SUPABASE_SERVICE_ROLE_KEY}}
function randomCode(n){const a="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";const b=new Uint8Array(n);crypto.getRandomValues(b);return Array.from(b,x=>a[x%a.length]).join("")}
function safeExt(v,fallback){const e=String(v||"").toLowerCase().replace(/[^a-z0-9]/g,"");return e&&e.length<=8?e:fallback}
function clean(v,max){return String(v??"").trim().slice(0,max)}
function validateDraft(b){
 if(!["classic-black","natural-oak","gallery-white"].includes(b.frame_variant))throw httpError(400,"Invalid frame selection");
 if(!["8x10","12x16"].includes(b.frame_size))throw httpError(400,"Invalid frame size");
 if(!b.photo||!b.video)throw httpError(400,"Photo and video are required");
 if(Number(b.photo.size)>20*1024*1024)throw httpError(400,"Photo is too large");
 if(Number(b.video.size)>100*1024*1024)throw httpError(400,"Video is too large");
}
function validateDelivery(b){
 for(const k of ["customer_name","customer_email","phone","address_line1","city","state","postal_code","country"])
   if(!clean(b[k],240))throw httpError(400,`Missing ${k}`);
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(b.customer_email)))throw httpError(400,"Invalid email");
}
function httpError(status,message){const e=new Error(message);e.status=status;return e}
function serverPrice(variant,size,env){
 // TEST defaults only. Override with Worker variables before production.
 const p8=Number(env.FRAME_PRICE_8X10_PAISE||100);
 const p12=Number(env.FRAME_PRICE_12X16_PAISE||200);
 if(!["classic-black","natural-oak","gallery-white"].includes(variant))return null;
 if(size==="8x10")return p8;
 if(size==="12x16")return p12;
 return null;
}
function assertRazorpayConfigured(env){
 if(!env.RAZORPAY_KEY_ID||!env.RAZORPAY_KEY_SECRET)throw httpError(500,"Razorpay keys are not configured");
 if(env.ALLOW_LIVE_PAYMENTS!=="true"&&!String(env.RAZORPAY_KEY_ID).startsWith("rzp_test_"))
   throw httpError(500,"Live Razorpay keys are blocked. Use test keys or explicitly enable live payments.");
}
async function rest(env,table,method,body,prefer){
 return fetch(`${env.SUPABASE_URL}/rest/v1/${table}`,{method,headers:{...svc(env),"Content-Type":"application/json","Prefer":prefer},body:JSON.stringify(body)});
}
async function patchOrder(env,id,patch){
 return fetch(`${env.SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(id)}`,{method:"PATCH",headers:{...svc(env),"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify({...patch,updated_at:new Date().toISOString()})});
}
async function patchFrame(env,id,patch){
 return fetch(`${env.SUPABASE_URL}/rest/v1/frames?id=eq.${encodeURIComponent(id)}`,{method:"PATCH",headers:{...svc(env),"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify({...patch,updated_at:new Date().toISOString()})});
}
async function createSignedUpload(env,bucket,path){
 const encoded=path.split("/").map(encodeURIComponent).join("/");
 const r=await fetch(`${env.SUPABASE_URL}/storage/v1/object/upload/sign/${encodeURIComponent(bucket)}/${encoded}`,{
   method:"POST",headers:{...svc(env),"Content-Type":"application/json"},body:"{}"
 });
 if(!r.ok)return null;
 const d=await r.json();
 const raw=d.url||d.signedURL||d.signedUrl;
 if(!raw)return null;
 return raw.startsWith("http")?raw:`${env.SUPABASE_URL}/storage/v1${raw}`;
}
async function requireOrderToken(env,id,token){
 if(!token)return{ok:false,status:401,error:"Missing order token"};
 const r=await fetch(`${env.SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(id)}&order_token=eq.${encodeURIComponent(token)}&select=*&limit=1`,{headers:svc(env)});
 if(!r.ok)return{ok:false,status:500,error:"Order lookup failed"};
 const rows=await r.json();if(!rows?.length)return{ok:false,status:403,error:"Invalid order token"};
 return{ok:true,data:rows[0]};
}
async function razorpay(env,path,method,body){
 const auth=btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
 const init={method,headers:{"Authorization":`Basic ${auth}`,"Content-Type":"application/json"}};
 if(body!==undefined)init.body=JSON.stringify(body);
 return fetch(`https://api.razorpay.com${path}`,init);
}
async function hmacHex(secret,message){
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(message));
 return [...new Uint8Array(sig)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function timingSafeEqual(a,b){
 a=String(a||"").toLowerCase();b=String(b||"").toLowerCase();
 if(a.length!==b.length)return false;
 let out=0;for(let i=0;i<a.length;i++)out|=a.charCodeAt(i)^b.charCodeAt(i);
 return out===0;
}
async function markOrderPaid(env,o,paymentId){
 if(o.payment_status==="paid"&&o.frame_id)return;

 let frameId=o.frame_id||null;
 if(!frameId){
   const frameRow={
     frame_code:o.frame_code,
     title:`Living Frame ${o.order_number}`,
     status:"awaiting_ar_setup",
     customer_id:o.customer_id,
     customer_name:o.customer_name,
     customer_email:o.customer_email,
     photo_path:o.photo_path,
     video_path:o.video_path,
     created_at:o.created_at
   };
   const fi=await rest(env,"frames","POST",frameRow,"return=representation");
   if(!fi.ok)throw new Error(`Could not create paid frame: ${await fi.text()}`);
   const rows=await fi.json();frameId=rows?.[0]?.id||null;
 }

 await patchOrder(env,o.id,{
   frame_id:frameId,
   razorpay_payment_id:paymentId,
   payment_status:"paid",
   status:"paid",
   paid_at:new Date().toISOString()
 });
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
