
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
let existingOrder=readOrderSession();

function readOrderSession(){
  try{
    const o=JSON.parse(sessionStorage.getItem("lf_order")||"null");
    return o?.order_id&&o?.order_token ? o : null;
  }catch{return null}
}
function saveOrderSession(data){
  sessionStorage.setItem("lf_order",JSON.stringify(data));
  existingOrder=data;
}
function clearOrderSession(){
  sessionStorage.removeItem("lf_order");
  existingOrder=null;
}

document.querySelectorAll(".frame-option").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll(".frame-option").forEach(x=>x.classList.remove("selected"));
  btn.classList.add("selected");
  frameVariant=btn.dataset.value;
  if(existingOrder?.assets_uploaded && existingOrder.frame_variant!==frameVariant){
    startFreshState();
  }
}));

document.querySelectorAll(".size-option").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll(".size-option").forEach(x=>x.classList.remove("selected"));
  btn.classList.add("selected");
  frameSize=btn.dataset.value;
  if(existingOrder?.assets_uploaded && existingOrder.frame_size!==frameSize){
    startFreshState();
  }
}));

photoInput.addEventListener("change",()=>{
  photoName.textContent=photoInput.files[0]?.name||"";
  if(photoInput.files[0] && existingOrder?.assets_uploaded) startFreshState();
});
videoInput.addEventListener("change",()=>{
  videoName.textContent=videoInput.files[0]?.name||"";
  if(videoInput.files[0] && existingOrder?.assets_uploaded) startFreshState();
});

function validate(photo,video){
  if(!photo) throw new Error("Please upload a photo.");
  if(!video) throw new Error("Please upload a video.");
  if(photo.size>20*1024*1024) throw new Error("Photo must be 20 MB or smaller.");
  if(video.size>100*1024*1024) throw new Error("Video must be 100 MB or smaller.");
}
function ext(name,fallback){
  const m=(name||"").match(/\.([A-Za-z0-9]{1,8})$/);
  return m?m[1].toLowerCase():fallback;
}
async function jsonFetch(url,options={}){
  const r=await fetch(url,options);
  let d={};try{d=await r.json()}catch{}
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
function progress(p,text){
  progressWrap.classList.remove("hidden");
  progressBar.style.width=`${p}%`;
  progressText.textContent=text;
}

function selectSavedOptions(order){
  if(order?.frame_variant){
    frameVariant=order.frame_variant;
    document.querySelectorAll(".frame-option").forEach(btn=>{
      btn.classList.toggle("selected",btn.dataset.value===frameVariant);
    });
  }
  if(order?.frame_size){
    frameSize=order.frame_size;
    document.querySelectorAll(".size-option").forEach(btn=>{
      btn.classList.toggle("selected",btn.dataset.value===frameSize);
    });
  }
}

function showResumeState(order){
  selectSavedOptions(order);

  photoName.textContent=order.photo_name ? `${order.photo_name} · uploaded ✓` : "Photo already uploaded ✓";
  videoName.textContent=order.video_name ? `${order.video_name} · uploaded ✓` : "Video already uploaded ✓";

  photoInput.disabled=true;
  videoInput.disabled=true;

  const photoBox=document.getElementById("photoBox");
  const videoBox=document.getElementById("videoBox");
  if(photoBox) photoBox.style.opacity=".72";
  if(videoBox) videoBox.style.opacity=".72";

  orderBtn.textContent="Continue to delivery →";

  let resume=document.getElementById("resumeOrderNotice");
  if(!resume){
    resume=document.createElement("div");
    resume.id="resumeOrderNotice";
    resume.style.cssText="margin-top:18px;padding:14px 16px;border:1px solid #ded7cc;border-radius:14px;background:#f8f6f1;font-size:13px;line-height:1.5";
    orderBtn.closest(".order-footer")?.insertAdjacentElement("beforebegin",resume);
  }
  resume.innerHTML=`
    <strong>Order ${escapeHtml(order.order_number)} is already prepared.</strong><br>
    Your photo and video are safely uploaded. You can continue to delivery details.
    <button id="startNewOrderBtn" type="button" style="margin-left:8px;border:0;background:none;text-decoration:underline;cursor:pointer;font-weight:800">Start a new order</button>
  `;

  document.getElementById("startNewOrderBtn")?.addEventListener("click",()=>{
    clearOrderSession();
    location.reload();
  });
}

function startFreshState(){
  clearOrderSession();
  photoInput.disabled=false;
  videoInput.disabled=false;
  const photoBox=document.getElementById("photoBox");
  const videoBox=document.getElementById("videoBox");
  if(photoBox) photoBox.style.opacity="1";
  if(videoBox) videoBox.style.opacity="1";
  document.getElementById("resumeOrderNotice")?.remove();
  orderBtn.textContent="Order this frame →";
}

function escapeHtml(v){
  return String(v??"").replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

orderBtn.addEventListener("click",async()=>{
  orderError.textContent="";

  if(existingOrder?.assets_uploaded){
    location.href="./checkout.html";
    return;
  }

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
      frame_size:frameSize,
      photo_name:photo.name,
      video_name:video.name,
      assets_uploaded:true
    };

    saveOrderSession(session);
    progress(100,"Ready for delivery details");
    location.href="./checkout.html";
  }catch(e){
    orderError.textContent=e.message;
    orderBtn.disabled=false;
  }
});

if(existingOrder?.assets_uploaded){
  showResumeState(existingOrder);
}
