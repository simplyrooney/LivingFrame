const API = "https://living-frame-backend.livingframe-anshul.workers.dev";

const loginPanel = document.getElementById("loginPanel");
const dashboard = document.getElementById("dashboard");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const adminError = document.getElementById("adminError");
const customersList = document.getElementById("customersList");
const summaryCards = document.getElementById("summaryCards");
const searchInput = document.getElementById("searchInput");
const paymentFilter = document.getElementById("paymentFilter");

let token = localStorage.getItem("lf_admin_token") || "";
let adminEmail = localStorage.getItem("lf_admin_email") || "";
let groups = [];

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[c]);

const label = (v) => String(v || "—").replace(/[_-]/g, " ");

function fmtDate(v) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short"
    });
  } catch {
    return v;
  }
}

function money(paise, currency = "INR") {
  if (paise === null || paise === undefined) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    minimumFractionDigits: 2
  }).format(Number(paise) / 100);
}

function fullAddress(o) {
  return [
    o.address_line1,
    o.address_line2,
    o.city,
    o.state,
    o.postal_code,
    o.country
  ].filter(Boolean).join(", ") || "—";
}

async function getConfig() {
  const r = await fetch(`${API}/api/public/config`);
  const d = await r.json();

  if (!r.ok) {
    throw new Error(d.error || "Could not load configuration");
  }

  return d;
}

async function supabaseLogin(email, password) {
  const cfg = await getConfig();

  const r = await fetch(
    `${cfg.supabase_url}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: cfg.supabase_publishable_key
      },
      body: JSON.stringify({ email, password })
    }
  );

  const d = await r.json();

  if (!r.ok || !d.access_token) {
    throw new Error(
      d.error_description ||
      d.msg ||
      "Login failed"
    );
  }

  token = d.access_token;
  adminEmail = email;

  localStorage.setItem("lf_admin_token", token);
  localStorage.setItem("lf_admin_email", email);
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const r = await fetch(`${API}${path}`, {
    ...options,
    headers
  });

  let d = {};
  try {
    d = await r.json();
  } catch {}

  if (r.status === 401) {
    localStorage.removeItem("lf_admin_token");
    localStorage.removeItem("lf_admin_email");
    token = "";
    adminEmail = "";
    showLogin();
  }

  if (!r.ok) {
    throw new Error(
      d.error ||
      d.detail ||
      `Request failed (${r.status})`
    );
  }

  return d;
}

function showLogin() {
  if (dashboard) dashboard.classList.add("hidden");
  if (loginPanel) loginPanel.classList.remove("hidden");

  document
    .querySelector(".admin-top-actions")
    ?.classList.add("hidden");
}

function showDashboard() {
  if (loginPanel) loginPanel.classList.add("hidden");
  if (dashboard) dashboard.classList.remove("hidden");

  document
    .querySelector(".admin-top-actions")
    ?.classList.remove("hidden");

  const emailEl = document.getElementById("adminEmail");
  if (emailEl) {
    emailEl.textContent = adminEmail;
  }
}

function renderSummary() {
  if (!summaryCards) return;

  const orders = groups.flatMap((g) => g.orders || []);
  const paidOrders = orders.filter(
    (o) => o.payment_status === "paid"
  );

  const paidValue = paidOrders.reduce(
    (sum, o) => sum + Number(o.price_paise || 0),
    0
  );

  summaryCards.innerHTML = `
    <article><span>Customers</span><strong>${groups.length}</strong></article>
    <article><span>Total orders</span><strong>${orders.length}</strong></article>
    <article><span>Paid orders</span><strong>${paidOrders.length}</strong></article>
    <article><span>Paid value</span><strong>${money(paidValue)}</strong></article>
  `;
}

function orderMatches(order, query, payment) {
  if (payment && order.payment_status !== payment) return false;
  if (!query) return true;

  const haystack = [
    order.order_number,
    order.customer_id,
    order.frame_code,
    order.customer_name,
    order.customer_email,
    order.phone,
    order.frame_variant,
    order.frame_size,
    order.razorpay_order_id,
    order.razorpay_payment_id,
    order.city,
    order.state,
    order.postal_code,
    order.country
  ].join(" ").toLowerCase();

  return haystack.includes(query);
}

function customerMatches(group, query, payment) {
  const orderMatch = (group.orders || []).some((order) =>
    orderMatches(order, query, payment)
  );
  if (orderMatch) return true;
  if (payment) return false;

  return [
    group.customer_name,
    group.customer_email,
    group.phone,
    group.customer_key
  ].join(" ").toLowerCase().includes(query);
}

function mediaCard(kind, url, downloadUrl) {
  if (!url) {
    return `<div class="media-empty">No ${kind} uploaded</div>`;
  }

  const preview =
    kind === "photo"
      ? `<img src="${esc(url)}" alt="Customer uploaded photo">`
      : `<video src="${esc(url)}" controls preload="metadata"></video>`;

  return `
    <div class="media-card">
      <div class="media-preview">${preview}</div>
      <div class="media-actions">
        <a class="small-btn" href="${esc(url)}" target="_blank" rel="noopener">View</a>
        ${downloadUrl ? `<a class="small-btn" href="${esc(downloadUrl)}">Download</a>` : ""}
      </div>
    </div>
  `;
}

function orderCard(order) {
  const frame = order.frame || {};

  const photoDownloadUrl = frame.id
    ? `${API}/api/admin/frames/${encodeURIComponent(frame.id)}/download/photo`
    : "";

  const videoDownloadUrl = frame.id
    ? `${API}/api/admin/frames/${encodeURIComponent(frame.id)}/download/video`
    : "";

  return `
    <article class="order-card">
      <div class="order-card-head">
        <div>
          <p class="eyebrow">${esc(order.order_number || "ORDER")}</p>
          <h3>${esc(label(order.frame_variant))} · ${esc(order.frame_size || "—")}</h3>
        </div>
        <div class="status-stack">
          <span class="pill">${esc(label(order.payment_status))}</span>
          <span class="pill soft">${esc(label(frame.status || order.status))}</span>
        </div>
      </div>

      <div class="order-details-grid">
        <div><span>Customer ID</span><b>${esc(order.customer_id || "—")}</b></div>
        <div><span>Frame code</span><b>${esc(order.frame_code || "—")}</b></div>
        <div><span>Customer name</span><b>${esc(order.customer_name || "—")}</b></div>
        <div><span>Email</span><b>${esc(order.customer_email || "—")}</b></div>
        <div><span>Phone</span><b>${esc(order.phone || "—")}</b></div>
        <div><span>Price</span><b>${esc(money(order.price_paise, order.currency))}</b></div>
        <div><span>Payment</span><b>${esc(label(order.payment_status))}</b></div>
        <div><span>Ordered</span><b>${esc(fmtDate(order.created_at))}</b></div>
        <div class="span-2"><span>Delivery address</span><b>${esc(fullAddress(order))}</b></div>
        <div><span>Razorpay order</span><b class="wrap">${esc(order.razorpay_order_id || "—")}</b></div>
        <div><span>Razorpay payment</span><b class="wrap">${esc(order.razorpay_payment_id || "—")}</b></div>
      </div>

      <div class="assets-title">Customer uploads</div>

      <div class="media-grid">
        ${mediaCard("photo", order.photo_url, photoDownloadUrl)}
        ${mediaCard("video", order.video_url, videoDownloadUrl)}
      </div>

      ${
        frame.id
          ? `
            <div class="fulfilment-box">
              <div class="field">
                <label>MyWebAR URL</label>
                <input id="ar-${frame.id}" value="${esc(frame.ar_experience_url || "")}" placeholder="https://mywebar.com/...">
              </div>

              <div class="field">
                <label>Fulfilment status</label>
                <select id="status-${frame.id}">
                  ${[
                    "awaiting_ar_setup",
                    "ar_configured",
                    "ready_to_print",
                    "printed",
                    "shipped",
                    "ready",
                    "failed",
                    "archived"
                  ].map((status) => `
                    <option value="${status}" ${frame.status === status ? "selected" : ""}>
                      ${label(status)}
                    </option>
                  `).join("")}
                </select>
              </div>

              <div class="field span-2">
                <label>Admin notes</label>
                <textarea id="notes-${frame.id}" rows="3">${esc(frame.admin_notes || "")}</textarea>
              </div>

              <div class="fulfilment-actions span-2">
                ${
                  frame.ar_experience_url
                    ? `<a class="ghost-btn" target="_blank" rel="noopener" href="./ar-viewer.html?frame=${encodeURIComponent(order.frame_code)}">Test AR</a>`
                    : ""
                }
                <button class="primary-btn" type="button" data-save-frame="${frame.id}">Save fulfilment</button>
              </div>
            </div>
          `
          : `<div class="frame-warning">Frame fulfilment record has not been created yet for this order.</div>`
      }
    </article>
  `;
}

function customerGroup(group, index, query, payment) {
  let shownOrders = (group.orders || []).filter((order) =>
    orderMatches(order, query, payment)
  );

  if (!shownOrders.length) shownOrders = group.orders || [];

  const customerTitle =
    group.customer_name ||
    group.customer_email ||
    group.phone ||
    "Customer";

  return `
    <section class="customer-group">
      <button class="customer-group-head" type="button" data-toggle="${index}">
        <div class="customer-avatar">${esc(customerTitle.slice(0, 1).toUpperCase())}</div>
        <div class="customer-main">
          <div class="customer-name">${esc(customerTitle)}</div>
          <div class="customer-meta">
            ${esc(group.customer_email || "No email")} ·
            ${esc(group.phone || "No phone")} ·
            ${group.orders.length} order${group.orders.length === 1 ? "" : "s"}
          </div>
        </div>
        <div class="customer-right">
          <span>${group.customer_user_id ? "Registered customer" : "Legacy / guest"}</span>
          <b>⌄</b>
        </div>
      </button>

      <div class="customer-orders-wrap">
        ${shownOrders.map(orderCard).join("")}
      </div>
    </section>
  `;
}

function render() {
  renderSummary();
  if (!customersList || !searchInput || !paymentFilter) return;

  const query = searchInput.value.trim().toLowerCase();
  const payment = paymentFilter.value;

  const filteredGroups = groups.filter((group) =>
    customerMatches(group, query, payment)
  );

  if (!filteredGroups.length) {
    customersList.innerHTML = `<div class="empty-admin">No matching customers or orders.</div>`;
    return;
  }

  customersList.innerHTML = filteredGroups
    .map((group, index) =>
      customerGroup(group, index, query, payment)
    )
    .join("");

  customersList.querySelectorAll("[data-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      button.closest(".customer-group")?.classList.toggle("open");
    });
  });

  customersList.querySelectorAll("[data-save-frame]").forEach((button) => {
    button.addEventListener("click", () => {
      saveFrame(button.dataset.saveFrame, button);
    });
  });
}

async function saveFrame(frameId, button) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Saving…";
  if (adminError) adminError.textContent = "";

  try {
    const arInput = document.getElementById(`ar-${frameId}`);
    const statusInput = document.getElementById(`status-${frameId}`);
    const notesInput = document.getElementById(`notes-${frameId}`);

    await api(`/api/admin/frames/${encodeURIComponent(frameId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        ar_provider: "mywebar",
        ar_experience_url: arInput?.value.trim() || null,
        status: statusInput?.value || "awaiting_ar_setup",
        admin_notes: notesInput?.value.trim() || null
      })
    });

    button.textContent = "Saved ✓";
    setTimeout(() => {
      button.textContent = originalText;
    }, 1200);
  } catch (e) {
    if (adminError) adminError.textContent = e.message;
    button.textContent = originalText;
  } finally {
    button.disabled = false;
  }
}

async function load() {
  if (adminError) adminError.textContent = "";
  const data = await api("/api/admin/customers");
  groups = data.customers || [];
  render();
}

/* LOGIN */
loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (loginError) loginError.textContent = "";

  const emailInput = document.getElementById("adminLoginEmail");
  const passwordInput = document.getElementById("adminLoginPassword");

  if (!emailInput || !passwordInput) {
    if (loginError) {
      loginError.textContent = "Admin login fields could not be found.";
    }
    return;
  }

  const submitButton = loginForm.querySelector('button[type="submit"]');

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Signing in…";
  }

  try {
    await supabaseLogin(
      emailInput.value.trim(),
      passwordInput.value
    );

    showDashboard();
    await load();
  } catch (e) {
    if (loginError) loginError.textContent = e.message;
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "Sign in";
    }
  }
});

/* LOGOUT */
document.getElementById("signOutBtn")?.addEventListener("click", () => {
  localStorage.removeItem("lf_admin_token");
  localStorage.removeItem("lf_admin_email");
  token = "";
  adminEmail = "";
  showLogin();
});

/* REFRESH */
document.getElementById("refreshBtn")?.addEventListener("click", async () => {
  try {
    await load();
  } catch {}
});

/* SEARCH */
searchInput?.addEventListener("input", render);

/* PAYMENT FILTER */
paymentFilter?.addEventListener("change", render);

/* INITIAL LOAD */
(async () => {
  if (!token) {
    showLogin();
    return;
  }

  try {
    showDashboard();
    await load();
  } catch {
    showLogin();
  }
})();
