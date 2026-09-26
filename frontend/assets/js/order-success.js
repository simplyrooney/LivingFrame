
const API="https://living-frame-backend.livingframe-anshul.workers.dev";
const order=JSON.parse(sessionStorage.getItem("lf_order")||"null");
const state=document.getElementById("successState");
const error=document.getElementById("successError");

if(!order?.order_id||!order?.order_token){
  location.href="./";
}

function money(paise){
  if(paise===null||paise===undefined) return "—";
  return new Intl.NumberFormat("en-IN",{
    style:"currency",
    currency:"INR",
    minimumFractionDigits:2
  }).format(Number(paise)/100);
}

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
  document.getElementById("sPrice").textContent=money(d.price_paise ?? order.price_paise);
  document.getElementById("sPayment").textContent=d.payment_status||order.payment_status||"—";
  document.getElementById("sStatus").textContent=d.status||order.status||"—";

  const heading=document.getElementById("orderHeading");
  heading.textContent=d.order_number||order.order_number||"Your order";

  if(d.payment_status==="paid"){
    state.textContent="Payment confirmed. Your order is now in the fulfilment queue.";
  }else if(d.payment_status==="processing"){
    state.textContent="Payment received. Final confirmation is still processing.";
  }else{
    state.textContent="Your order is saved. Payment confirmation is still pending.";
  }
}

let tries=0;
async function poll(){
  try{
    const d=await getStatus();
    render(d);

    if(d.payment_status!=="paid" && tries<10){
      tries++;
      setTimeout(poll,2500);
    }
  }catch(e){
    error.textContent=e.message;
  }
}
poll();
