
const list=document.getElementById("ordersList");
const empty=document.getElementById("ordersEmpty");
const error=document.getElementById("accountError");

function money(paise,currency="INR"){
  return new Intl.NumberFormat("en-IN",{style:"currency",currency:currency||"INR",minimumFractionDigits:2}).format(Number(paise||0)/100);
}
function esc(v){
  return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}

document.getElementById("customerLogoutBtn").addEventListener("click",()=>{
  window.LFAuth.clear();location.href="./";
});

(async()=>{
  const user=await window.LFAuth.getUser();
  if(!user){location.href=`./auth.html?next=${encodeURIComponent("./account.html")}`;return}
  document.getElementById("accountEmail").textContent=user.email||"";

  try{
    const d=await window.LFAuth.api("/api/customer/orders");
    const orders=d.orders||[];
    if(!orders.length){empty.classList.remove("hidden");return}

    list.innerHTML=orders.map(o=>`
      <article class="customer-order-card">
        <div class="customer-order-top">
          <div>
            <p class="eyebrow">${esc(o.order_number)}</p>
            <h2>${esc((o.frame_variant||"Living Frame").replace(/-/g," "))}</h2>
          </div>
          <span class="customer-order-status">${esc(o.status||o.payment_status||"order")}</span>
        </div>
        <div class="customer-order-grid">
          <div><span>Customer ID</span><b>${esc(o.customer_id)}</b></div>
          <div><span>Frame code</span><b>${esc(o.frame_code)}</b></div>
          <div><span>Size</span><b>${esc(o.frame_size)}</b></div>
          <div><span>Price</span><b>${money(o.price_paise,o.currency)}</b></div>
          <div><span>Payment</span><b>${esc(o.payment_status)}</b></div>
          <div><span>Ordered</span><b>${o.created_at?new Date(o.created_at).toLocaleDateString():"—"}</b></div>
        </div>
      </article>
    `).join("");
  }catch(e){error.textContent=e.message}
})();
