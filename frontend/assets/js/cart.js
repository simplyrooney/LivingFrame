
const cart=window.lfReadCart?.()||null;
const empty=document.getElementById("emptyCart");
const content=document.getElementById("cartContent");

if(!cart){
  empty.classList.remove("hidden");
}else{
  content.classList.remove("hidden");
  const frame=(cart.frame_variant||"").replace(/-/g," ");
  document.getElementById("cartFrame").textContent=frame;
  document.getElementById("cartSize").textContent=cart.frame_size||"—";
  document.getElementById("cartPhoto").textContent=cart.photo_name?`${cart.photo_name} ✓`:"Uploaded ✓";
  document.getElementById("cartVideo").textContent=cart.video_name?`${cart.video_name} ✓`:"Uploaded ✓";
  document.getElementById("cartOrder").textContent=cart.order_number||"—";
  document.getElementById("summaryFrame").textContent=frame;
  document.getElementById("summarySize").textContent=cart.frame_size||"—";
}

document.getElementById("removeCartBtn")?.addEventListener("click",()=>{
  sessionStorage.removeItem("lf_order");
  window.lfUpdateHeader?.();
  location.reload();
});

document.getElementById("checkoutBtn")?.addEventListener("click",async()=>{
  const user=await window.LFAuth.getUser();
  if(!user){
    location.href=`./auth.html?next=${encodeURIComponent("./checkout.html")}`;
    return;
  }
  try{
    await window.LFAuth.claimOrder(cart);
    location.href="./checkout.html";
  }catch(e){alert(e.message)}
});
