
const API="https://living-frame-backend.livingframe-anshul.workers.dev";
const order=window.lfReadCart?.()||null;
const form=document.getElementById("deliveryForm");
const error=document.getElementById("checkoutError");

async function init(){
  if(!order?.order_id||!order?.order_token){location.href="./cart.html";return}
  const user=await window.LFAuth.getUser();
  if(!user){location.href=`./auth.html?next=${encodeURIComponent("./checkout.html")}`;return}

  try{await window.LFAuth.claimOrder(order)}
  catch(e){error.textContent=e.message;return}

  document.getElementById("orderNumber").textContent=order.order_number;
  document.getElementById("customerId").textContent=order.customer_id;
  document.getElementById("frameVariant").textContent=order.frame_variant.replace(/-/g," ");
  document.getElementById("frameSize").textContent=order.frame_size;

  const emailInput=form.querySelector('[name="customer_email"]');
  if(emailInput&&user.email) emailInput.value=user.email;
}

form.addEventListener("submit",async e=>{
  e.preventDefault();error.textContent="";
  const btn=form.querySelector("button[type=submit]");
  btn.disabled=true;btn.textContent="Saving…";
  try{
    const body=Object.fromEntries(new FormData(form).entries());
    body.order_token=order.order_token;

    const r=await fetch(`${API}/api/customer/orders/${encodeURIComponent(order.order_id)}/delivery`,{
      method:"PATCH",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${window.LFAuth.getToken()}`
      },
      body:JSON.stringify(body)
    });
    let d={};try{d=await r.json()}catch{}
    if(!r.ok) throw new Error(d.error||d.detail||`Request failed (${r.status})`);

    sessionStorage.setItem("lf_order",JSON.stringify({...order,...body}));
    location.href="./payment.html";
  }catch(err){
    error.textContent=err.message;
    btn.disabled=false;btn.textContent="Continue to payment →";
  }
});

init();
