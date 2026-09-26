
const BACKEND_URL = "https://living-frame-backend.livingframe-anshul.workers.dev";

document.getElementById("demoForm")?.addEventListener("submit", (e) => {
  e.preventDefault();
  document.getElementById("formNote").textContent =
    "Frontend is ready. The next backend step is connecting create-frame + signed upload endpoints to Supabase Storage.";
});

window.LIVING_FRAME = { BACKEND_URL };
