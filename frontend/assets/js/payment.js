
const API="https://living-frame-backend.livingframe-anshul.workers.dev";
const order=JSON.parse(sessionStorage.getItem("lf_order")||"null");
const payBtn=document.getElementById("payBtn");
const error=document.getElementById("paymentError");
const state=document.getElementById("paymentState");

if(!order?.order_id||!order?.order_token) location.href="./cart.html";

document.getElementById("paymentOrder").textContent=order.order_number||"—";
document.getElementById("paymentCustomer").textContent=order.customer_id||"—";
document.getElementById("paymentFrame").textContent=(order.frame_variant||"").replace(/-/g," ");
document.getElementById("paymentSize").textContent=order.frame_size||"—";

let paymentConfig=null,verificationInProgress=false,paymentInProgress=false;

function money(paise){
  return new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",minimumFractionDigits:2}).format((paise||0)/100);
}
async function customerPost(path,body){
  const r=await fetch(`${API}${path}`,{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Authorization":`Bearer ${window.LFAuth.getToken()}`
    },
    body:JSON.stringify(body)
  });
  let d={};try{d=await r.json()}catch{}
  if(!r.ok&&r.status!==202) throw new Error(d.error||d.detail||`Request failed (${r.status})`);
  return {status:r.status,data:d};
}
async function checkOrderStatus(){
  const {data}=await customerPost(`/api/customer/orders/${encodeURIComponent(order.order_id)}/status`,{order_token:order.order_token});
  return data;
}
async function prepare(){
  const user=await window.LFAuth.getUser();
  if(!user){location.href=`./auth.html?next=${encodeURIComponent("./payment.html")}`;return}
  payBtn.disabled=true;state.textContent="Preparing secure payment…";
  const {data}=await customerPost(`/api/customer/orders/${encodeURIComponent(order.order_id)}/payment/create`,{order_token:order.order_token});
  paymentConfig=data;
  document.getElementById("paymentAmount").textContent=money(data.amount);
  payBtn.textContent=`Pay ${money(data.amount)}`;
  payBtn.disabled=false;state.textContent="";
}
function setVerifyingUI(){
  verificationInProgress=true;paymentInProgress=false;
  payBtn.disabled=true;payBtn.textContent="Payment received — verifying…";
  payBtn.style.opacity=".65";state.textContent="Verifying payment…";error.textContent="";
}
async function verify(response){
  if(verificationInProgress)return;
  setVerifyingUI();
  try{
    const {data:result}=await customerPost(`/api/customer/orders/${encodeURIComponent(order.order_id)}/payment/verify`,{
      order_token:order.order_token,
      razorpay_order_id:response.razorpay_order_id,
      razorpay_payment_id:response.razorpay_payment_id,
      razorpay_signature:response.razorpay_signature
    });
    sessionStorage.setItem("lf_order",JSON.stringify({...order,payment_status:result.payment_status,status:result.status}));
    location.href="./order-success.html";
  }catch(e){
    try{
      const latest=await checkOrderStatus();
      if(["paid","processing"].includes(latest.payment_status)){
        location.href="./order-success.html";return;
      }
    }catch{}
    verificationInProgress=false;
    payBtn.disabled=false;payBtn.style.opacity="1";
    payBtn.textContent="Check payment status";
    state.textContent="We could not confirm the payment yet.";
    error.textContent=e.message;
  }
}
payBtn.addEventListener("click",async()=>{
  if(paymentInProgress||verificationInProgress)return;
  error.textContent="";
  try{
    const latest=await checkOrderStatus();
    if(["paid","processing"].includes(latest.payment_status)){location.href="./order-success.html";return}
    paymentInProgress=true;
    if(!paymentConfig) await prepare();

    const rzp=new Razorpay({
      key:paymentConfig.key_id,
      amount:paymentConfig.amount,
      currency:paymentConfig.currency,
      name:"Living Frame",
      description:`Order ${paymentConfig.order_number}`,
      order_id:paymentConfig.razorpay_order_id,
      prefill:{name:paymentConfig.customer_name||"",email:paymentConfig.customer_email||"",contact:paymentConfig.phone||""},
      handler:verify,
      modal:{ondismiss:function(){paymentInProgress=false;if(!verificationInProgress)state.textContent="Payment window closed. Your order is still saved."}}
    });
    rzp.on("payment.failed",function(resp){
      paymentInProgress=false;
      error.textContent=resp.error?.description||"Payment failed. Please try again.";
    });
    rzp.open();
  }catch(e){
    paymentInProgress=false;error.textContent=e.message;payBtn.disabled=false;
  }
});

(async()=>{
  const user=await window.LFAuth.getUser();
  if(!user){location.href=`./auth.html?next=${encodeURIComponent("./payment.html")}`;return}
  try{
    const latest=await checkOrderStatus();
    if(["paid","processing"].includes(latest.payment_status)){location.href="./order-success.html";return}
  }catch{}
  prepare().catch(e=>{error.textContent=e.message;payBtn.disabled=false});
})();
