import { createClient } from "@supabase/supabase-js";
import { customAlphabet } from "nanoid";

const makeCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 8);

const json = (statusCode, body, origin="*") => ({
  statusCode,
  headers: {
    "content-type":"application/json; charset=utf-8",
    "access-control-allow-origin": origin,
    "access-control-allow-headers":"Authorization, Content-Type",
    "access-control-allow-methods":"GET,POST,PATCH,DELETE,OPTIONS"
  },
  body: JSON.stringify(body)
});

function getClients(){
  const {SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY} = process.env;
  if(!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY){
    throw new Error("Supabase environment variables are not configured");
  }
  return {
    admin:createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}),
    anon:createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:false}})
  };
}

async function getUser(event, anon){
  const h = event.headers.authorization || event.headers.Authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if(!token) return null;
  const {data,error}=await anon.auth.getUser(token);
  if(error) return null;
  return data?.user || null;
}

export async function handler(event){
  const origin = process.env.FRONTEND_ORIGIN || "*";
  if(event.httpMethod==="OPTIONS") return json(204,{},origin);

  const rawPath = event.path || "";
  const path = rawPath
    .replace(/^\/api/,"")
    .replace(/^\/\.netlify\/functions\/api/,"") || "/";

  if(path==="/health"){
    return json(200,{
      ok:true,
      service:"living-frame-backend",
      runtime:"netlify-functions",
      version:"2.0.0"
    },origin);
  }

  let clients;
  try{
    clients=getClients();
  }catch(err){
    return json(500,{error:err.message},origin);
  }

  const user=await getUser(event,clients.anon);
  if(!user) return json(401,{error:"Unauthorized"},origin);

  const body = event.body ? JSON.parse(event.body) : {};
  const parts = path.split("/").filter(Boolean);

  try{
    if(event.httpMethod==="POST" && path==="/frames"){
      const title=String(body.title||"Untitled memory").trim().slice(0,120);
      for(let i=0;i<4;i++){
        const {data,error}=await clients.admin.from("frames").insert({
          frame_code:`LF-${makeCode()}`,
          user_id:user.id,
          title,
          status:"draft"
        }).select().single();

        if(!error) return json(201,data,origin);
        if(error.code!=="23505") return json(500,{error:error.message},origin);
      }
      return json(500,{error:"Could not generate frame code"},origin);
    }

    if(event.httpMethod==="GET" && path==="/frames"){
      const {data,error}=await clients.admin.from("frames")
        .select("*").eq("user_id",user.id)
        .order("created_at",{ascending:false});
      if(error) return json(500,{error:error.message},origin);
      return json(200,data,origin);
    }

    if(parts[0]==="frames" && parts[1]){
      const id=parts[1];

      if(event.httpMethod==="GET" && parts.length===2){
        const {data,error}=await clients.admin.from("frames")
          .select("*").eq("id",id).eq("user_id",user.id).single();
        if(error||!data) return json(404,{error:"Frame not found"},origin);
        return json(200,data,origin);
      }

      if(event.httpMethod==="PATCH" && parts.length===2){
        const patch={};
        for(const k of ["title","target_width","target_height"]){
          if(body[k]!==undefined) patch[k]=body[k];
        }
        const {data,error}=await clients.admin.from("frames")
          .update(patch).eq("id",id).eq("user_id",user.id).select().single();
        if(error||!data) return json(404,{error:"Frame not found"},origin);
        return json(200,data,origin);
      }

      if(event.httpMethod==="DELETE" && parts.length===2){
        const {error}=await clients.admin.from("frames")
          .delete().eq("id",id).eq("user_id",user.id);
        if(error) return json(500,{error:error.message},origin);
        return {statusCode:204,headers:{"access-control-allow-origin":origin},body:""};
      }

      if(event.httpMethod==="POST" && parts[2]==="upload-url"){
        const {data:frame}=await clients.admin.from("frames")
          .select("id,frame_code").eq("id",id).eq("user_id",user.id).single();
        if(!frame) return json(404,{error:"Frame not found"},origin);

        const kind=body.kind;
        if(!["photo","video"].includes(kind)) return json(400,{error:"kind must be photo or video"},origin);

        const safe=String(body.filename||`${kind}.bin`).replace(/[^a-zA-Z0-9._-]/g,"_").slice(-120);
        const bucket=kind==="photo" ? process.env.PHOTO_BUCKET : process.env.VIDEO_BUCKET;
        const objectPath=`${user.id}/${frame.frame_code}/${Date.now()}-${safe}`;

        const {data,error}=await clients.admin.storage.from(bucket).createSignedUploadUrl(objectPath);
        if(error) return json(500,{error:error.message},origin);
        return json(200,{bucket,path:objectPath,token:data.token,signedUrl:data.signedUrl},origin);
      }

      if(event.httpMethod==="POST" && parts[2]==="asset-complete"){
        const {data:frame}=await clients.admin.from("frames")
          .select("*").eq("id",id).eq("user_id",user.id).single();
        if(!frame) return json(404,{error:"Frame not found"},origin);

        const {kind,path:assetPath}=body;
        if(!["photo","video"].includes(kind)||!assetPath){
          return json(400,{error:"kind and path are required"},origin);
        }

        const patch=kind==="photo"?{photo_path:assetPath}:{video_path:assetPath};
        const hasPhoto=kind==="photo" || !!frame.photo_path;
        const hasVideo=kind==="video" || !!frame.video_path;
        if(hasPhoto&&hasVideo) patch.status="assets_uploaded";

        const {data,error}=await clients.admin.from("frames")
          .update(patch).eq("id",id).eq("user_id",user.id).select().single();
        if(error) return json(500,{error:error.message},origin);
        return json(200,data,origin);
      }

      if(event.httpMethod==="POST" && parts[2]==="process"){
        const {data:frame}=await clients.admin.from("frames")
          .select("*").eq("id",id).eq("user_id",user.id).single();
        if(!frame) return json(404,{error:"Frame not found"},origin);
        if(!frame.photo_path||!frame.video_path){
          return json(409,{error:"Photo and video must both be uploaded first"},origin);
        }

        const {data,error}=await clients.admin.from("frames")
          .update({status:"processing",error_message:null})
          .eq("id",id).eq("user_id",user.id).select().single();
        if(error) return json(500,{error:error.message},origin);

        return json(202,{
          ...data,
          processing:{queued:true,next:"FFmpeg worker + AR provider"}
        },origin);
      }
    }

    return json(404,{error:"Route not found",path},origin);
  }catch(err){
    return json(500,{error:err?.message||"Internal server error"},origin);
  }
}
