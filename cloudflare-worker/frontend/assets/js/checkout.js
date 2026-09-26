
const API="https://living-frame-backend.livingframe-anshul.workers.dev";
const order=JSON.parse(sessionStorage.getItem("lf_order")||"null");
const form=document.getElementById("deliveryForm");
const error=document.getElementById("checkoutError");

if(!order?.order_id||!order?.order_token){
  location.href="./";
}else{
  document.getElementById("orderNumber").textContent=order.order_number;
  document.getElementById("customerId").textContent=order.customer_id;
  document.getElementById("frameVariant").textContent=order.frame_variant.replace(/-/g," ");
  document.getElementById("frameSize").textContent=order.frame_size;
}

form.addEventListener("submit",async e=>{
  e.preventDefault();error.textContent="";
  const btn=form.querySelector("button[type=submit]");btn.disabled=true;btn.textContent="Saving…";
  try{
    const body=Object.fromEntries(new FormData(form).entries());
    body.order_token=order.order_token;
    const r=await fetch(`${API}/api/public/orders/${encodeURIComponent(order.order_id)}/delivery`,{
      method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)
    });
    let d={};try{d=await r.json()}catch{}
    if(!r.ok) throw new Error(d.error||d.detail||`Request failed (${r.status})`);
    sessionStorage.setItem("lf_order",JSON.stringify({...order,...body}));
    location.href="./payment.html";
  }catch(err){
    error.textContent=err.message;btn.disabled=false;btn.textContent="Continue to payment →";
  }
});
