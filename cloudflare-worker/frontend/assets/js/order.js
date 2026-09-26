
const API="https://living-frame-backend.livingframe-anshul.workers.dev";
const photoInput=document.getElementById("photoInput");
const videoInput=document.getElementById("videoInput");
const photoName=document.getElementById("photoName");
const videoName=document.getElementById("videoName");
const orderBtn=document.getElementById("orderBtn");
const orderError=document.getElementById("orderError");
const progressWrap=document.getElementById("progressWrap");
const progressBar=document.getElementById("progressBar");
const progressText=document.getElementById("progressText");

let frameVariant="classic-black";
let frameSize="8x10";

document.querySelectorAll(".frame-option").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll(".frame-option").forEach(x=>x.classList.remove("selected"));
  btn.classList.add("selected");frameVariant=btn.dataset.value;
}));
document.querySelectorAll(".size-option").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll(".size-option").forEach(x=>x.classList.remove("selected"));
  btn.classList.add("selected");frameSize=btn.dataset.value;
}));

photoInput.addEventListener("change",()=>photoName.textContent=photoInput.files[0]?.name||"");
videoInput.addEventListener("change",()=>videoName.textContent=videoInput.files[0]?.name||"");

function validate(photo,video){
  if(!photo) throw new Error("Please upload a photo.");
  if(!video) throw new Error("Please upload a video.");
  if(photo.size>20*1024*1024) throw new Error("Photo must be 20 MB or smaller.");
  if(video.size>100*1024*1024) throw new Error("Video must be 100 MB or smaller.");
}
function ext(name,fallback){
  const m=(name||"").match(/\.([A-Za-z0-9]{1,8})$/);return m?m[1].toLowerCase():fallback;
}
async function jsonFetch(url,options={}){
  const r=await fetch(url,options);let d={};try{d=await r.json()}catch{}
  if(!r.ok) throw new Error(d.error||d.detail||`Request failed (${r.status})`);
  return d;
}
async function signedUpload(url,file){
  const form=new FormData();
  form.append("cacheControl","3600");
  form.append("",file);
  const r=await fetch(url,{method:"PUT",body:form});
  if(!r.ok) throw new Error(`Upload failed (${r.status})`);
}
function progress(p,text){progressWrap.classList.remove("hidden");progressBar.style.width=`${p}%`;progressText.textContent=text}

orderBtn.addEventListener("click",async()=>{
  orderError.textContent="";
  const photo=photoInput.files[0],video=videoInput.files[0];
  try{
    validate(photo,video);
    orderBtn.disabled=true;
    progress(8,"Creating your order…");

    const draft=await jsonFetch(`${API}/api/public/orders/draft`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        frame_variant:frameVariant,
        frame_size:frameSize,
        photo:{name:photo.name,type:photo.type,size:photo.size,ext:ext(photo.name,"jpg")},
        video:{name:video.name,type:video.type,size:video.size,ext:ext(video.name,"mp4")}
      })
    });

    progress(22,"Uploading photo…");
    await signedUpload(draft.photo_upload_url,photo);

    progress(58,"Uploading video…");
    await signedUpload(draft.video_upload_url,video);

    progress(88,"Finalizing uploads…");
    await jsonFetch(`${API}/api/public/orders/${encodeURIComponent(draft.order_id)}/assets-complete`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({order_token:draft.order_token})
    });

    const session={
      order_id:draft.order_id,
      order_token:draft.order_token,
      order_number:draft.order_number,
      customer_id:draft.customer_id,
      frame_code:draft.frame_code,
      frame_variant:frameVariant,
      frame_size:frameSize
    };
    sessionStorage.setItem("lf_order",JSON.stringify(session));
    progress(100,"Ready for delivery details");
    location.href="./checkout.html";
  }catch(e){
    orderError.textContent=e.message;
    orderBtn.disabled=false;
  }
});
