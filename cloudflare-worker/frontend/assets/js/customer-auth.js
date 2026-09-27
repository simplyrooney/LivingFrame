
const LF_API="https://living-frame-backend.livingframe-anshul.workers.dev";

const LFAuth={
  tokenKey:"lf_customer_token",
  emailKey:"lf_customer_email",

  getToken(){return localStorage.getItem(this.tokenKey)||""},
  getEmail(){return localStorage.getItem(this.emailKey)||""},

  setSession(token,email){
    localStorage.setItem(this.tokenKey,token);
    localStorage.setItem(this.emailKey,email||"");
  },

  clear(){
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.emailKey);
  },

  async config(){
    const r=await fetch(`${LF_API}/api/public/config`);
    const d=await r.json();
    if(!r.ok) throw new Error(d.error||"Could not load authentication config");
    return d;
  },

  async getUser(){
    const token=this.getToken();
    if(!token) return null;
    try{
      const cfg=await this.config();
      const r=await fetch(`${cfg.supabase_url}/auth/v1/user`,{
        headers:{apikey:cfg.supabase_publishable_key,Authorization:`Bearer ${token}`}
      });
      if(!r.ok){this.clear();return null}
      const user=await r.json();
      if(user?.email) localStorage.setItem(this.emailKey,user.email);
      return user;
    }catch{return null}
  },

  async login(email,password){
    const cfg=await this.config();
    const r=await fetch(`${cfg.supabase_url}/auth/v1/token?grant_type=password`,{
      method:"POST",
      headers:{"Content-Type":"application/json",apikey:cfg.supabase_publishable_key},
      body:JSON.stringify({email,password})
    });
    const d=await r.json();
    if(!r.ok||!d.access_token) throw new Error(d.error_description||d.msg||"Login failed");
    this.setSession(d.access_token,email);
    return d;
  },

  async signup(email,password){
    const cfg=await this.config();
    const r=await fetch(`${cfg.supabase_url}/auth/v1/signup`,{
      method:"POST",
      headers:{"Content-Type":"application/json",apikey:cfg.supabase_publishable_key},
      body:JSON.stringify({email,password})
    });
    const d=await r.json();
    if(!r.ok) throw new Error(d.msg||d.error_description||"Sign up failed");
    if(d.access_token) this.setSession(d.access_token,email);
    return d;
  },

  async api(path,options={}){
    const token=this.getToken();
    const headers=new Headers(options.headers||{});
    if(token) headers.set("Authorization",`Bearer ${token}`);
    if(options.body&&!headers.has("Content-Type")) headers.set("Content-Type","application/json");
    const r=await fetch(`${LF_API}${path}`,{...options,headers});
    let d={};try{d=await r.json()}catch{}
    if(!r.ok) throw new Error(d.error||d.detail||`Request failed (${r.status})`);
    return d;
  },

  async claimOrder(order){
    return this.api(`/api/customer/orders/${encodeURIComponent(order.order_id)}/claim`,{
      method:"POST",
      body:JSON.stringify({order_token:order.order_token})
    });
  }
};

function lfReadCart(){
  try{
    const o=JSON.parse(sessionStorage.getItem("lf_order")||"null");
    return o?.order_id&&o?.order_token?o:null;
  }catch{return null}
}

function lfUpdateHeader(){
  const item=lfReadCart();
  document.querySelectorAll("#cartCount").forEach(el=>el.textContent=item?"1":"0");

  const account=document.getElementById("accountLink");
  if(account){
    if(LFAuth.getToken()){
      account.textContent="Account";
      account.href="./account.html";
    }else{
      account.textContent="Login / Sign up";
      account.href="./auth.html";
    }
  }
}

window.LFAuth=LFAuth;
window.lfReadCart=lfReadCart;
window.lfUpdateHeader=lfUpdateHeader;
document.addEventListener("DOMContentLoaded",lfUpdateHeader);
