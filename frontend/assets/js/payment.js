
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

async function post(path,body){
  const r=await fetch(`${API}${path}`,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(body)
  });
  let d={};try{d=await r.json()}catch{}
  if(!r.ok) throw new Error(d.error||d.detail||`Request failed (${r.status})`);
  return d;
}

function money(paise){
  return new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format((paise||0)/100);
}

async function prepare(){
  payBtn.disabled=true;
  state.textContent="Preparing secure payment…";
  paymentConfig=await post(`/api/public/orders/${encodeURIComponent(order.order_id)}/payment/create`,{
    order_token:order.order_token
  });
  document.getElementById("paymentAmount").textContent=money(paymentConfig.amount);
  payBtn.textContent=`Pay ${money(paymentConfig.amount)}`;
  payBtn.disabled=false;
  state.textContent="";
}

async function verify(response){
  state.textContent="Verifying payment…";
  const result=await post(`/api/public/orders/${encodeURIComponent(order.order_id)}/payment/verify`,{
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

  location.href="./order-success.html";
}

payBtn.addEventListener("click",async()=>{
  error.textContent="";
  try{
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
        ondismiss:function(){state.textContent="Payment window closed. Your order is still saved."}
      }
    };

    const rzp=new Razorpay(options);
    rzp.on("payment.failed",function(resp){
      error.textContent=resp.error?.description||"Payment failed. Please try again.";
    });
    rzp.open();
  }catch(e){
    error.textContent=e.message;
    payBtn.disabled=false;
  }
});

prepare().catch(e=>{
  error.textContent=e.message;
  payBtn.disabled=false;
});
