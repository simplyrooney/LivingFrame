
const API="https://living-frame-backend.livingframe-anshul.workers.dev";
const FRONTEND=location.origin;
const $=id=>document.getElementById(id);
let config=null,frames=[],accessToken=localStorage.getItem("lf_admin_token")||"";

async function api(path,options={}){
  const headers=new Headers(options.headers||{});
  if(accessToken)headers.set("Authorization",`Bearer ${accessToken}`);
  if(options.body&&!headers.has("Content-Type"))headers.set("Content-Type","application/json");
  const res=await fetch(`${API}${path}`,{...options,headers});
  let data={}; try{data=await res.json()}catch{}
  if(!res.ok)throw new Error(data.error||data.detail||`Request failed (${res.status})`);
  return data;
}

async function getConfig(){config=await api("/api/public/config")}
async function login(email,password){
  if(!config)await getConfig();
  const res=await fetch(`${config.supabase_url}/auth/v1/token?grant_type=password`,{
    method:"POST",headers:{"Content-Type":"application/json","apikey":config.supabase_publishable_key},
    body:JSON.stringify({email,password})
  });
  const data=await res.json();
  if(!res.ok||!data.access_token)throw new Error(data.error_description||data.msg||"Login failed");
  accessToken=data.access_token;
  localStorage.setItem("lf_admin_token",accessToken);
  localStorage.setItem("lf_admin_email",email);
}
function logout(){accessToken="";localStorage.removeItem("lf_admin_token");localStorage.removeItem("lf_admin_email");showLogin()}
function showLogin(){$("loginView").classList.remove("hidden");$("dashboardView").classList.add("hidden");$("logoutBtn").classList.add("hidden");$("adminIdentity").textContent=""}
function showDashboard(){$("loginView").classList.add("hidden");$("dashboardView").classList.remove("hidden");$("logoutBtn").classList.remove("hidden");$("adminIdentity").textContent=localStorage.getItem("lf_admin_email")||"Admin"}
async function loadFrames(){const r=await api("/api/admin/frames");frames=r.frames||[];renderStats();renderFrames()}
function renderStats(){
 const c={total:frames.length,pending:frames.filter(f=>["assets_uploaded","awaiting_ar_setup"].includes(f.status)).length,print:frames.filter(f=>f.status==="ready_to_print").length,shipped:frames.filter(f=>f.status==="shipped").length};
 $("stats").innerHTML=`<div class="stat"><b>${c.total}</b><span>TOTAL FRAMES</span></div><div class="stat"><b>${c.pending}</b><span>AR SETUP PENDING</span></div><div class="stat"><b>${c.print}</b><span>READY TO PRINT</span></div><div class="stat"><b>${c.shipped}</b><span>SHIPPED</span></div>`;
}
function filtered(){const q=$("searchInput").value.trim().toLowerCase(),s=$("statusFilter").value;return frames.filter(f=>{const t=[f.frame_code,f.title,f.customer_name,f.customer_email].filter(Boolean).join(" ").toLowerCase();return(!q||t.includes(q))&&(!s||f.status===s)})}
function renderFrames(){
 const container=$("orders"),tpl=$("orderTemplate"),list=filtered();container.innerHTML="";$("emptyState").classList.toggle("hidden",list.length!==0);
 for(const f of list){
  const node=tpl.content.cloneNode(true);
  node.querySelector(".frame-code").textContent=f.frame_code;
  node.querySelector(".frame-title").textContent=f.title||"Untitled Living Frame";
  node.querySelector(".order-meta").textContent=[f.customer_name,f.customer_email,f.created_at?new Date(f.created_at).toLocaleString():""].filter(Boolean).join(" · ");
  node.querySelector(".status-pill").textContent=f.status||"—";
  const pl=node.querySelector(".photo-link"),pi=node.querySelector(".photo-preview");
  if(f.photo_url){pl.href=f.photo_url;pi.src=f.photo_url}else pl.classList.add("disabled");
  const vl=node.querySelector(".video-link");if(f.video_url)vl.href=f.video_url;else vl.classList.add("disabled");
  const au=node.querySelector(".ar-url"),ss=node.querySelector(".status-select"),notes=node.querySelector(".admin-notes"),btn=node.querySelector(".save-btn"),state=node.querySelector(".save-state"),viewer=node.querySelector(".viewer-link");
  au.value=f.ar_experience_url||"";ss.value=f.status||"draft";notes.value=f.admin_notes||"";viewer.href=`${FRONTEND}/ar-viewer.html?frame=${encodeURIComponent(f.frame_code)}`;
  btn.addEventListener("click",async()=>{btn.disabled=true;state.textContent="Saving…";try{await api(`/api/admin/frames/${encodeURIComponent(f.id)}`,{method:"PATCH",body:JSON.stringify({status:ss.value,ar_provider:au.value.trim()?"mywebar":null,ar_experience_url:au.value.trim()||null,admin_notes:notes.value.trim()||null})});state.textContent="Saved";await loadFrames()}catch(e){state.textContent=e.message}finally{btn.disabled=false}});
  container.appendChild(node);
 }
}
$("loginForm").addEventListener("submit",async e=>{e.preventDefault();$("loginError").textContent="";try{await login($("email").value.trim(),$("password").value);showDashboard();await loadFrames()}catch(err){$("loginError").textContent=err.message}});
$("logoutBtn").addEventListener("click",logout);$("refreshBtn").addEventListener("click",loadFrames);$("searchInput").addEventListener("input",renderFrames);$("statusFilter").addEventListener("change",renderFrames);
(async()=>{try{await getConfig();if(!accessToken)return showLogin();showDashboard();await loadFrames()}catch(e){logout();$("loginError").textContent=e.message}})();
