
const API="https://living-frame-backend.livingframe-anshul.workers.dev";
const order=JSON.parse(sessionStorage.getItem("lf_order")||"null");
const state=document.getElementById("successState");
const error=document.getElementById("successError");

if(!order?.order_id||!order?.order_token) location.href="./";

async function getStatus(){
  const r=await fetch(`${API}/api/public/orders/${encodeURIComponent(order.order_id)}/status`,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({order_token:order.order_token})
  });
  let d={};try{d=await r.json()}catch{}
  if(!r.ok) throw new Error(d.error||d.detail||`Request failed (${r.status})`);
  return d;
}

function render(d){
  document.getElementById("sOrder").textContent=d.order_number||order.order_number||"—";
  document.getElementById("sCustomer").textContent=d.customer_id||order.customer_id||"—";
  document.getElementById("sFrameCode").textContent=d.frame_code||order.frame_code||"—";
  document.getElementById("sFrame").textContent=(d.frame_variant||order.frame_variant||"").replace(/-/g," ");
  document.getElementById("sSize").textContent=d.frame_size||order.frame_size||"—";
  document.getElementById("sPayment").textContent=d.payment_status||"pending";
  document.getElementById("sStatus").textContent=d.status||"pending";

  if(d.payment_status==="paid"){
    document.getElementById("successIntro").textContent="Payment confirmed. Your order is now in our fulfilment queue.";
    state.textContent="We’ll prepare the AR experience, print the target photo, frame it and ship it.";
  }else if(d.payment_status==="processing"){
    document.getElementById("successIntro").textContent="Your payment was received and is still being confirmed.";
    state.textContent="This page will check again automatically.";
  }else{
    document.getElementById("successIntro").textContent="Your order is saved, but payment is not yet confirmed.";
    state.textContent="If you completed payment, confirmation may take a moment.";
  }
}

let tries=0;
async function poll(){
  try{
    const d=await getStatus();render(d);
    if(d.payment_status!=="paid"&&tries<8){
      tries++;setTimeout(poll,2500);
    }
  }catch(e){error.textContent=e.message}
}
poll();
