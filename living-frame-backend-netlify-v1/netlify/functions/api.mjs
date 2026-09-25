import express from 'express';
import serverless from 'serverless-http';
import { createClient } from '@supabase/supabase-js';
import { customAlphabet } from 'nanoid';

const app = express();
app.use(express.json({limit:'1mb'}));

const allowedOrigin = process.env.FRONTEND_ORIGIN;
app.use((req,res,next)=>{
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin || '*');
  res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS');
  if(req.method==='OPTIONS') return res.status(204).end();
  next();
});

const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(url, service, {auth:{persistSession:false}});
const authClient = createClient(url, anon, {auth:{persistSession:false}});
const makeCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

app.get('/health', (_req,res)=>res.json({ok:true,service:'living-frame-backend',runtime:'netlify-functions'}));

async function auth(req,res,next){
  const h=req.headers.authorization||'';
  const token=h.startsWith('Bearer ')?h.slice(7):null;
  if(!token) return res.status(401).json({error:'Missing bearer token'});
  const {data,error}=await authClient.auth.getUser(token);
  if(error||!data?.user) return res.status(401).json({error:'Invalid or expired token'});
  req.user=data.user;
  next();
}
app.use(auth);

app.post('/frames', async (req,res)=>{
  const title=String(req.body?.title||'Untitled memory').trim().slice(0,120);
  for(let i=0;i<4;i++){
    const {data,error}=await admin.from('frames').insert({
      frame_code:`LF-${makeCode()}`, user_id:req.user.id, title, status:'draft'
    }).select().single();
    if(!error) return res.status(201).json(data);
    if(error.code!=='23505') return res.status(500).json({error:error.message});
  }
  res.status(500).json({error:'Could not generate unique frame code'});
});

app.get('/frames', async (req,res)=>{
  const {data,error}=await admin.from('frames').select('*').eq('user_id',req.user.id).order('created_at',{ascending:false});
  if(error) return res.status(500).json({error:error.message});
  res.json(data);
});

app.get('/frames/:id', async (req,res)=>{
  const {data,error}=await admin.from('frames').select('*').eq('id',req.params.id).eq('user_id',req.user.id).single();
  if(error||!data) return res.status(404).json({error:'Frame not found'});
  res.json(data);
});

app.patch('/frames/:id', async (req,res)=>{
  const patch={};
  for(const k of ['title','target_width','target_height']){
    if(req.body?.[k]!==undefined) patch[k]=req.body[k];
  }
  const {data,error}=await admin.from('frames').update(patch).eq('id',req.params.id).eq('user_id',req.user.id).select().single();
  if(error||!data) return res.status(404).json({error:'Frame not found'});
  res.json(data);
});

async function ownedFrame(id,userId){
  const {data}=await admin.from('frames').select('*').eq('id',id).eq('user_id',userId).single();
  return data||null;
}

app.post('/frames/:id/upload-url', async (req,res)=>{
  const {kind,filename}=req.body||{};
  if(!['photo','video'].includes(kind)) return res.status(400).json({error:'kind must be photo or video'});
  const frame=await ownedFrame(req.params.id,req.user.id);
  if(!frame) return res.status(404).json({error:'Frame not found'});
  const safe=String(filename||`${kind}.bin`).replace(/[^a-zA-Z0-9._-]/g,'_').slice(-120);
  const bucket=kind==='photo'?process.env.PHOTO_BUCKET:process.env.VIDEO_BUCKET;
  const path=`${req.user.id}/${frame.frame_code}/${Date.now()}-${safe}`;
  const {data,error}=await admin.storage.from(bucket).createSignedUploadUrl(path);
  if(error) return res.status(500).json({error:error.message});
  res.json({bucket,path,token:data.token,signedUrl:data.signedUrl});
});

app.post('/frames/:id/asset-complete', async (req,res)=>{
  const {kind,path}=req.body||{};
  if(!['photo','video'].includes(kind)||!path) return res.status(400).json({error:'kind and path required'});
  const frame=await ownedFrame(req.params.id,req.user.id);
  if(!frame) return res.status(404).json({error:'Frame not found'});
  const patch=kind==='photo'?{photo_path:path}:{video_path:path};
  const hasPhoto=kind==='photo'||!!frame.photo_path;
  const hasVideo=kind==='video'||!!frame.video_path;
  if(hasPhoto&&hasVideo) patch.status='assets_uploaded';
  const {data,error}=await admin.from('frames').update(patch).eq('id',req.params.id).eq('user_id',req.user.id).select().single();
  if(error) return res.status(500).json({error:error.message});
  res.json(data);
});

app.post('/frames/:id/process', async (req,res)=>{
  const frame=await ownedFrame(req.params.id,req.user.id);
  if(!frame) return res.status(404).json({error:'Frame not found'});
  if(!frame.photo_path||!frame.video_path) return res.status(409).json({error:'Photo and video must be uploaded first'});
  const {data,error}=await admin.from('frames').update({status:'processing',error_message:null}).eq('id',req.params.id).eq('user_id',req.user.id).select().single();
  if(error) return res.status(500).json({error:error.message});
  res.status(202).json({...data,processing:{queued:true,next:'FFmpeg worker + AR provider'}});
});

app.delete('/frames/:id', async (req,res)=>{
  const {error}=await admin.from('frames').delete().eq('id',req.params.id).eq('user_id',req.user.id);
  if(error) return res.status(500).json({error:error.message});
  res.status(204).end();
});

export const handler = serverless(app);
