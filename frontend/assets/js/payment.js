
const API="https://living-frame-backend.livingframe-anshul.workers.dev";
const order=JSON.parse(sessionStorage.getItem("lf_order")||"null");
const payBtn=document.getElementById("payBtn");
const error=document.getElementById("paymentError");
const state=document.getElementById("paymentState");

if(!order?.order_id||!order?.order_token){
  location.href="./";
}

document.getElementById("paymentOrder").textContent=order.order_number||"—";
document.getElementById("paymentCustomer").textContent=order.customer_id||"—";
document.getElementById("paymentFrame").textContent=(order.frame_variant||"").replace(/-/g," ");
document.getElementById("paymentSize").textContent=order.frame_size||"—";

let paymentConfig=null;
let paymentInProgress=false;
let verificationInProgress=false;

async function post(path,body){
  const r=await fetch(`${API}${path}`,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(body)
  });
  let d={};try{d=await r.json()}catch{}
  if(!r.ok && r.status!==202){
    throw new Error(d.error||d.detail||`Request failed (${r.status})`);
  }
  return {status:r.status,data:d};
}

function money(paise){
  return new Intl.NumberFormat("en-IN",{
    style:"currency",
    currency:"INR",
    minimumFractionDigits:2
  }).format((paise||0)/100);
}

function setVerifyingUI(){
  verificationInProgress=true;
  paymentInProgress=false;
  payBtn.disabled=true;
  payBtn.textContent="Payment received — verifying…";
  payBtn.style.opacity=".65";
  payBtn.style.cursor="not-allowed";
  state.textContent="Verifying payment…";
  error.textContent="";
}

function setPaidUI(){
  payBtn.disabled=true;
  payBtn.textContent="Payment successful ✓";
  payBtn.style.opacity=".65";
  payBtn.style.cursor="not-allowed";
  state.textContent="Payment confirmed. Opening your order…";
}

async function checkOrderStatus(){
  const {data}=await post(`/api/public/orders/${encodeURIComponent(order.order_id)}/status`,{
    order_token:order.order_token
  });
  return data;
}

async function prepare(){
  if(verificationInProgress) return;
  payBtn.disabled=true;
  state.textContent="Preparing secure payment…";
  const {data}=await post(`/api/public/orders/${encodeURIComponent(order.order_id)}/payment/create`,{
    order_token:order.order_token
  });
  paymentConfig=data;
  document.getElementById("paymentAmount").textContent=money(paymentConfig.amount);
  payBtn.textContent=`Pay ${money(paymentConfig.amount)}`;
  payBtn.disabled=false;
  state.textContent="";
}

async function verify(response){
  if(verificationInProgress) return;
  setVerifyingUI();

  try{
    const {data:result}=await post(`/api/public/orders/${encodeURIComponent(order.order_id)}/payment/verify`,{
      order_token:order.order_token,
      razorpay_order_id:response.razorpay_order_id,
      razorpay_payment_id:response.razorpay_payment_id,
      razorpay_signature:response.razorpay_signature
    });

    sessionStorage.setItem("lf_order",JSON.stringify({
      ...order,
      payment_status:result.payment_status,
      status:result.status
    }));

    if(result.payment_status==="paid"){
      setPaidUI();
    }else{
      state.textContent="Payment received. Final confirmation is processing…";
      payBtn.textContent="Payment received ✓";
    }

    // Always move to confirmation page. It polls the backend if capture is delayed.
    setTimeout(()=>{ location.href="./order-success.html"; },350);
  }catch(e){
    // Payment may already be successful even if the browser verification request
    // was interrupted. Re-check the order before showing Pay again.
    try{
      const latest=await checkOrderStatus();
      if(latest.payment_status==="paid" || latest.payment_status==="processing"){
        sessionStorage.setItem("lf_order",JSON.stringify({
          ...order,
          payment_status:latest.payment_status,
          status:latest.status
        }));
        if(latest.payment_status==="paid") setPaidUI();
        else{
          payBtn.disabled=true;
          payBtn.textContent="Payment received ✓";
          state.textContent="Payment received. Final confirmation is processing…";
        }
        setTimeout(()=>{ location.href="./order-success.html"; },350);
        return;
      }
    }catch{}

    verificationInProgress=false;
    payBtn.disabled=false;
    payBtn.style.opacity="1";
    payBtn.style.cursor="pointer";
    payBtn.textContent="Check payment status";
    state.textContent="We could not confirm the payment yet.";
    error.textContent=e.message;
  }
}

payBtn.addEventListener("click",async()=>{
  if(paymentInProgress || verificationInProgress) return;
  error.textContent="";

  // If this page was revisited after payment, check backend first.
  try{
    const latest=await checkOrderStatus();
    if(latest.payment_status==="paid" || latest.payment_status==="processing"){
      verificationInProgress=true;
      payBtn.disabled=true;
      payBtn.textContent=latest.payment_status==="paid"?"Payment successful ✓":"Payment received ✓";
      state.textContent=latest.payment_status==="paid"
        ?"Payment confirmed. Opening your order…"
        :"Payment received. Final confirmation is processing…";
      setTimeout(()=>{location.href="./order-success.html";},350);
      return;
    }
  }catch{}

  try{
    paymentInProgress=true;
    if(!paymentConfig) await prepare();

    const options={
      key:paymentConfig.key_id,
      amount:paymentConfig.amount,
      currency:paymentConfig.currency,
      name:"Living Frame",
      description:`Order ${paymentConfig.order_number}`,
      order_id:paymentConfig.razorpay_order_id,
      prefill:{
        name:paymentConfig.customer_name||"",
        email:paymentConfig.customer_email||"",
        contact:paymentConfig.phone||""
      },
      theme:{},
      handler:verify,
      modal:{
        ondismiss:function(){
          paymentInProgress=false;
          if(!verificationInProgress){
            state.textContent="Payment window closed. Your order is still saved.";
          }
        }
      }
    };

    const rzp=new Razorpay(options);
    rzp.on("payment.failed",function(resp){
      paymentInProgress=false;
      error.textContent=resp.error?.description||"Payment failed. Please try again.";
    });
    rzp.open();
  }catch(e){
    paymentInProgress=false;
    error.textContent=e.message;
    payBtn.disabled=false;
  }
});

// On reload/back navigation, never blindly show Pay again if payment was already received.
(async()=>{
  try{
    const latest=await checkOrderStatus();
    if(latest.payment_status==="paid" || latest.payment_status==="processing"){
      verificationInProgress=true;
      payBtn.disabled=true;
      payBtn.textContent=latest.payment_status==="paid"?"Payment successful ✓":"Payment received ✓";
      state.textContent=latest.payment_status==="paid"
        ?"Payment confirmed. Opening your order…"
        :"Payment received. Final confirmation is processing…";
      setTimeout(()=>{location.href="./order-success.html";},500);
      return;
    }
  }catch{}

  prepare().catch(e=>{
    error.textContent=e.message;
    payBtn.disabled=false;
  });
})();
