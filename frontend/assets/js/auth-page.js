
const params=new URLSearchParams(location.search);
const next=params.get("next")||"./account.html";
let mode="login";

const loginTab=document.getElementById("loginTab");
const signupTab=document.getElementById("signupTab");
const form=document.getElementById("authForm");
const title=document.getElementById("authTitle");
const subtitle=document.getElementById("authSubtitle");
const submit=document.getElementById("authSubmit");
const message=document.getElementById("authMessage");
const error=document.getElementById("authError");
const password=document.getElementById("authPassword");

function setMode(nextMode){
  mode=nextMode;
  loginTab.classList.toggle("active",mode==="login");
  signupTab.classList.toggle("active",mode==="signup");
  if(mode==="login"){
    title.textContent="Welcome back.";
    subtitle.textContent="Sign in to continue with your Living Frame order.";
    submit.textContent="Login";
    password.autocomplete="current-password";
  }else{
    title.textContent="Create your account.";
    subtitle.textContent="Save your orders and continue checkout.";
    submit.textContent="Sign up";
    password.autocomplete="new-password";
  }
  message.textContent="";error.textContent="";
}
loginTab.addEventListener("click",()=>setMode("login"));
signupTab.addEventListener("click",()=>setMode("signup"));

async function continueNext(){
  const cart=window.lfReadCart?.();
  if(cart&&next.includes("checkout")) await window.LFAuth.claimOrder(cart);
  location.href=next;
}

form.addEventListener("submit",async e=>{
  e.preventDefault();
  error.textContent="";message.textContent="";submit.disabled=true;
  submit.textContent=mode==="login"?"Signing in…":"Creating account…";

  const email=document.getElementById("authEmail").value.trim();
  const pass=password.value;

  try{
    if(mode==="login"){
      await window.LFAuth.login(email,pass);
      await continueNext();
    }else{
      const result=await window.LFAuth.signup(email,pass);
      if(result.access_token){
        await continueNext();
      }else{
        setMode("login");
        document.getElementById("authEmail").value=email;
        message.textContent="Account created. Check your email if confirmation is enabled, then login.";
      }
    }
  }catch(e){error.textContent=e.message}
  finally{
    submit.disabled=false;
    submit.textContent=mode==="login"?"Login":"Sign up";
  }
});

(async()=>{
  const user=await window.LFAuth.getUser();
  if(user){
    title.textContent="You’re already signed in.";
    subtitle.textContent=user.email||window.LFAuth.getEmail();
    document.querySelector(".auth-tabs").classList.add("hidden");
    form.innerHTML=`
      <a class="btn primary full" href="${next}">Continue</a>
      <button id="logoutCustomerBtn" class="btn secondary full" type="button">Sign out</button>
    `;
    document.getElementById("logoutCustomerBtn")?.addEventListener("click",()=>{
      window.LFAuth.clear();location.reload();
    });
  }
})();
