// ORBIT WhatsApp Console — admin dashboard frontend.
// Talks to the session-protected /admin/api/* endpoints. No build step; plain ES modules.

const $ = (sel) => document.querySelector(sel);
const el = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; };

async function api(path, opts = {}) {
  const res = await fetch(`/admin/api${path}`, {
    method: opts.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
  return data;
}

function toast(msg, isErr = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast" + (isErr ? " err" : "");
  setTimeout(() => (t.className = "toast hide"), 3200);
}

function badge(status) {
  const s = String(status).toUpperCase();
  const ok = ["ACTIVE", "HEALTHY", "PAID", "APPROVED", "SUCCEEDED", "DELIVERED", "READ", "SENT"];
  const bad = ["SUSPENDED", "UNHEALTHY", "FAILED", "OVERDUE", "REJECTED", "CANCELLED", "DEPROVISIONED"];
  const warn = ["PENDING", "PAST_DUE", "ISSUED", "UNKNOWN", "QUEUED", "DRAFT"];
  const cls = ok.includes(s) ? "ok" : bad.includes(s) ? "bad" : warn.includes(s) ? "warn" : "muted";
  return `<span class="badge ${cls}">${s}</span>`;
}

const money = (cents, cur = "USD") => `${(cents / 100).toFixed(2)} ${cur}`;
const fmt = (d) => (d ? new Date(d).toLocaleString() : "—");

// ---------------- Auth ----------------
async function boot() {
  try {
    const me = await api("/me");
    showApp(me);
  } catch {
    $("#login").classList.remove("hide");
    $("#app").classList.add("hide");
  }
}

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const r = await api("/login", { method: "POST", body: { email: $("#email").value, password: $("#password").value } });
    showApp(r.admin);
  } catch (err) {
    toast(err.message, true);
  }
});

$("#logoutBtn").addEventListener("click", async () => {
  await api("/logout", { method: "POST" });
  location.reload();
});

function showApp(me) {
  $("#login").classList.add("hide");
  $("#app").classList.remove("hide");
  $("#whoami").textContent = `${me.name} · ${me.email}`;
  navigate("overview");
}

// ---------------- Navigation ----------------
const titles = {
  overview: "Dashboard", clients: "Clients", accounts: "WhatsApp Accounts",
  billing: "Billing", messaging: "Messaging", analytics: "Analytics", apikeys: "API Keys",
};
document.querySelectorAll(".nav-item[data-view]").forEach((b) =>
  b.addEventListener("click", () => navigate(b.dataset.view))
);

async function navigate(view) {
  document.querySelectorAll(".nav-item[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  $("#viewTitle").textContent = titles[view];
  $("#view").innerHTML = `<div class="muted">Loading…</div>`;
  try {
    await views[view]();
  } catch (err) {
    $("#view").innerHTML = `<div class="panel">⚠️ ${err.message}</div>`;
  }
}

// ---------------- Views ----------------
const views = {};

views.overview = async () => {
  const { stats, recent } = await api("/overview");
  const cards = [
    ["Clients", stats.clients], ["WhatsApp Accounts", stats.accounts], ["Plans", stats.plans],
    ["Active Subs", stats.activeSubs], ["Open Invoices", stats.openInvoices],
  ].map(([l, n]) => `<div class="stat"><div class="n">${n}</div><div class="l">${l}</div></div>`).join("");
  const rows = recent.map((r) => `<tr><td>${fmt(r.createdAt)}</td><td><span class="badge muted">${r.actorType}</span></td><td class="mono">${r.action}</td><td class="mono">${r.targetId ? r.targetType + ":" + r.targetId.slice(0, 10) : "—"}</td></tr>`).join("");
  $("#view").innerHTML = `
    <div class="stats">${cards}</div>
    <div class="panel"><h3>Recent activity</h3>
      <table><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th></tr></thead>
      <tbody>${rows || `<tr><td colspan=4 class="muted">No activity yet</td></tr>`}</tbody></table>
    </div>`;
};

views.clients = async () => {
  const { data } = await api("/clients");
  const rows = data.map((c) => `<tr>
    <td>${c.name}<div class="muted mono">${c.id}</div></td>
    <td>${c.email}</td><td>${c.companyName || "—"}</td>
    <td>${badge(c.status)}</td>
    <td>${c._count?.whatsappAccounts ?? 0}</td>
    <td>${c.status === "ACTIVE"
      ? `<button class="btn tiny secondary" data-suspend="${c.id}">Suspend</button>`
      : `<button class="btn tiny" data-activate="${c.id}">Activate</button>`}</td>
  </tr>`).join("");
  $("#view").innerHTML = `
    <div class="panel"><h3>Add a client</h3>
      <div class="row">
        <div><label>Name</label><input id="c_name" placeholder="Acme Corp"></div>
        <div><label>Email</label><input id="c_email" placeholder="ops@acme.com"></div>
        <div><label>Company</label><input id="c_company" placeholder="Acme Inc"></div>
        <div style="flex:0"><button class="btn" id="c_add">Create</button></div>
      </div>
    </div>
    <div class="panel"><h3>Clients (${data.length})</h3>
      <table><thead><tr><th>Name</th><th>Email</th><th>Company</th><th>Status</th><th>Accounts</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan=6 class="muted">No clients yet</td></tr>`}</tbody></table>
    </div>`;
  $("#c_add").onclick = async () => {
    try {
      await api("/clients", { method: "POST", body: { name: $("#c_name").value, email: $("#c_email").value, companyName: $("#c_company").value || undefined } });
      toast("Client created"); navigate("clients");
    } catch (e) { toast(e.message, true); }
  };
  document.querySelectorAll("[data-suspend]").forEach((b) => b.onclick = async () => { await api(`/clients/${b.dataset.suspend}/suspend`, { method: "POST" }); toast("Suspended"); navigate("clients"); });
  document.querySelectorAll("[data-activate]").forEach((b) => b.onclick = async () => { await api(`/clients/${b.dataset.activate}/activate`, { method: "POST" }); toast("Activated"); navigate("clients"); });
};

views.accounts = async () => {
  const [{ data: accounts }, { data: clients }] = await Promise.all([api("/accounts"), api("/clients")]);
  const opts = clients.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
  const rows = accounts.map((a) => `<tr>
    <td class="mono">${a.phoneNumberId}<div class="muted">${a.displayPhoneNumber || ""}</div></td>
    <td>${a.client?.name || a.clientId}</td>
    <td><span class="badge muted">${a.provider}</span></td>
    <td>${badge(a.status)}</td><td>${badge(a.healthStatus)}</td>
    <td>
      <button class="btn tiny" data-hc="${a.id}">Health check</button>
      ${a.status === "SUSPENDED"
        ? `<button class="btn tiny secondary" data-resume="${a.id}">Resume</button>`
        : `<button class="btn tiny secondary" data-suspend="${a.id}">Suspend</button>`}
    </td>
  </tr>`).join("");
  $("#view").innerHTML = `
    <div class="panel"><h3>Provision a WhatsApp account</h3>
      <div class="row">
        <div><label>Client</label><select id="a_client">${opts}</select></div>
        <div><label>Provider</label><select id="a_provider"><option value="MOCK">MOCK (test)</option><option value="CLOUD_API">CLOUD_API (live)</option></select></div>
        <div><label>WABA ID</label><input id="a_waba" placeholder="WhatsApp Business Account ID"></div>
      </div>
      <div class="row">
        <div><label>Phone Number ID</label><input id="a_pnid" placeholder="Meta phone number ID"></div>
        <div><label>Access Token</label><input id="a_token" type="password" placeholder="stored encrypted"></div>
        <div><label>Webhook Verify Token</label><input id="a_vt" placeholder="optional"></div>
        <div style="flex:0; align-self:flex-end;"><button class="btn" id="a_add">Provision</button></div>
      </div>
      <div class="hint">Use MOCK to try the flow without real Meta credentials. Tokens are encrypted at rest and never shown again.</div>
    </div>
    <div class="panel"><h3>Accounts (${accounts.length})</h3>
      <table><thead><tr><th>Phone Number ID</th><th>Client</th><th>Provider</th><th>Status</th><th>Health</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan=6 class="muted">No accounts yet</td></tr>`}</tbody></table>
    </div>`;
  $("#a_add").onclick = async () => {
    try {
      await api("/accounts", { method: "POST", body: {
        clientId: $("#a_client").value, provider: $("#a_provider").value, wabaId: $("#a_waba").value,
        phoneNumberId: $("#a_pnid").value, accessToken: $("#a_token").value, webhookVerifyToken: $("#a_vt").value || undefined,
      } });
      toast("Account provisioned — run a health check to activate"); navigate("accounts");
    } catch (e) { toast(e.message, true); }
  };
  document.querySelectorAll("[data-hc]").forEach((b) => b.onclick = async () => {
    try { const r = await api(`/accounts/${b.dataset.hc}/health-check`, { method: "POST" }); toast(r.result.healthy ? "Healthy ✓ account active" : "Unhealthy: " + r.result.error, !r.result.healthy); navigate("accounts"); }
    catch (e) { toast(e.message, true); }
  });
  document.querySelectorAll("[data-suspend]").forEach((b) => b.onclick = async () => { await api(`/accounts/${b.dataset.suspend}/suspend`, { method: "POST" }); toast("Suspended"); navigate("accounts"); });
  document.querySelectorAll("[data-resume]").forEach((b) => b.onclick = async () => { await api(`/accounts/${b.dataset.resume}/resume`, { method: "POST" }); toast("Resumed"); navigate("accounts"); });
};

views.billing = async () => {
  const [{ data: plans }, { data: subs }, { data: invoices }, { data: clients }] =
    await Promise.all([api("/plans"), api("/subscriptions"), api("/invoices"), api("/clients")]);
  const planCards = plans.map((p) => `<div class="stat"><div class="n">${money(p.priceCents, p.currency)}</div><div class="l">${p.name} · ${p.messageQuota} msgs · ${p.maxWhatsAppAccounts} acct</div></div>`).join("");
  const clientOpts = clients.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
  const planOpts = plans.map((p) => `<option value="${p.name}">${p.name}</option>`).join("");
  const subRows = subs.map((s) => `<tr><td>${s.client?.name}</td><td>${s.plan?.name}</td><td>${badge(s.status)}</td><td>${fmt(s.renewalDate)}</td></tr>`).join("");
  const invRows = invoices.map((i) => `<tr>
    <td class="mono">${i.id.slice(0, 12)}</td><td>${i.client?.name}</td><td>${money(i.amountCents, i.currency)}</td>
    <td>${badge(i.status)}</td><td>${fmt(i.dueAt)}</td>
    <td>${i.status === "PAID" ? "" : `<button class="btn tiny" data-pay="${i.id}">Mark paid</button>`}</td>
  </tr>`).join("");
  $("#view").innerHTML = `
    <div class="stats" style="grid-template-columns:repeat(3,1fr)">${planCards}</div>
    <div class="grid-2">
      <div class="panel"><h3>New subscription</h3>
        <label>Client</label><select id="s_client">${clientOpts}</select>
        <label>Plan</label><select id="s_plan">${planOpts}</select>
        <button class="btn" id="s_add" style="margin-top:14px">Subscribe (auto-invoices)</button>
      </div>
      <div class="panel"><h3>Subscriptions (${subs.length})</h3>
        <table><thead><tr><th>Client</th><th>Plan</th><th>Status</th><th>Renewal</th></tr></thead>
        <tbody>${subRows || `<tr><td colspan=4 class="muted">None</td></tr>`}</tbody></table>
      </div>
    </div>
    <div class="panel"><h3>Invoices (${invoices.length})</h3>
      <table><thead><tr><th>Invoice</th><th>Client</th><th>Amount</th><th>Status</th><th>Due</th><th></th></tr></thead>
      <tbody>${invRows || `<tr><td colspan=6 class="muted">No invoices yet</td></tr>`}</tbody></table>
    </div>`;
  $("#s_add").onclick = async () => {
    try { await api("/subscriptions", { method: "POST", body: { clientId: $("#s_client").value, plan: $("#s_plan").value } }); toast("Subscribed + invoice generated"); navigate("billing"); }
    catch (e) { toast(e.message, true); }
  };
  document.querySelectorAll("[data-pay]").forEach((b) => b.onclick = async () => {
    try { await api(`/invoices/${b.dataset.pay}/pay`, { method: "POST", body: { reference: "admin-ui" } }); toast("Invoice marked paid"); navigate("billing"); }
    catch (e) { toast(e.message, true); }
  });
};

views.messaging = async () => {
  const { data: accounts } = await api("/accounts");
  const active = accounts.filter((a) => a.status === "ACTIVE");
  const opts = active.map((a) => `<option value="${a.id}">${a.phoneNumberId} (${a.client?.name || ""})</option>`).join("");
  $("#view").innerHTML = `
    <div class="panel"><h3>Send a message</h3>
      ${active.length ? `
      <div class="row">
        <div><label>From account</label><select id="m_acct">${opts}</select></div>
        <div><label>To (E.164, no +)</label><input id="m_to" placeholder="15551234567"></div>
      </div>
      <label>Message</label><textarea id="m_body" rows="3" placeholder="Hello!"></textarea>
      <button class="btn" id="m_send" style="margin-top:12px">Send</button>
      <div class="hint">MOCK accounts simulate the send; CLOUD_API accounts send for real via Meta.</div>`
      : `<div class="muted">No ACTIVE accounts. Provision one and run a health check first.</div>`}
    </div>
    <div class="panel"><h3>Conversation log</h3>
      <div class="row" style="margin-bottom:12px">
        <div><label>Account</label><select id="l_acct">${accounts.map((a) => `<option value="${a.id}">${a.phoneNumberId}</option>`).join("")}</select></div>
        <div style="flex:0; align-self:flex-end"><button class="btn secondary" id="l_load">Load</button></div>
      </div>
      <div id="logBox"><div class="muted">Pick an account and load.</div></div>
    </div>`;
  const sendBtn = $("#m_send");
  if (sendBtn) sendBtn.onclick = async () => {
    try { const m = await api("/messages/send", { method: "POST", body: { accountId: $("#m_acct").value, to: $("#m_to").value, body: $("#m_body").value } }); toast(`Sent (${m.status})`); loadLog($("#l_acct").value = $("#m_acct").value); }
    catch (e) { toast(e.message, true); }
  };
  async function loadLog(accountId) {
    const { data } = await api(`/messages?accountId=${accountId}`);
    const rows = data.map((m) => `<tr><td>${fmt(m.createdAt)}</td><td>${badge(m.direction)}</td><td>${m.type}</td><td class="mono">${m.fromNumber} → ${m.toNumber}</td><td>${badge(m.status)}</td></tr>`).join("");
    $("#logBox").innerHTML = `<table><thead><tr><th>When</th><th>Dir</th><th>Type</th><th>From → To</th><th>Status</th></tr></thead><tbody>${rows || `<tr><td colspan=5 class="muted">No messages</td></tr>`}</tbody></table>`;
  }
  $("#l_load").onclick = () => loadLog($("#l_acct").value);
};

views.analytics = async () => {
  const { data: clients } = await api("/clients");
  const opts = clients.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
  $("#view").innerHTML = `
    <div class="panel"><div class="row" style="align-items:flex-end">
      <div><label>Client</label><select id="an_client">${opts}</select></div>
      <div style="flex:0"><button class="btn" id="an_load">Load</button></div>
    </div></div>
    <div id="anBox"></div>`;
  async function load(clientId) {
    if (!clientId) return;
    const a = await api(`/analytics/${clientId}`);
    const cards = [["Sent", a.totals.sent], ["Delivered", a.totals.delivered], ["Read", a.totals.read], ["Failed", a.totals.failed], ["Inbound", a.totals.inbound]]
      .map(([l, n]) => `<div class="stat"><div class="n">${n}</div><div class="l">${l}</div></div>`).join("");
    const rows = a.accounts.map((ac) => `<tr><td class="mono">${ac.phoneNumberId}</td><td>${badge(ac.status)}</td><td>${ac.messages.sent}</td><td>${ac.messages.delivered}</td><td>${ac.messages.read}</td><td>${ac.messages.failed}</td><td>${ac.messages.inbound}</td><td>${ac.quota ? ac.quota.used + "/" + ac.quota.quota : "—"}</td></tr>`).join("");
    $("#anBox").innerHTML = `<div class="stats">${cards}</div>
      <div class="panel"><h3>Per account — ${a.clientName}</h3>
        <table><thead><tr><th>Account</th><th>Status</th><th>Sent</th><th>Delivered</th><th>Read</th><th>Failed</th><th>Inbound</th><th>Quota</th></tr></thead>
        <tbody>${rows || `<tr><td colspan=8 class="muted">No accounts</td></tr>`}</tbody></table></div>`;
  }
  $("#an_load").onclick = () => load($("#an_client").value);
  if (clients.length) load(clients[0].id);
};

views.apikeys = async () => {
  const { data: clients } = await api("/clients");
  const opts = clients.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
  $("#view").innerHTML = `
    <div class="panel"><h3>Issue / view API keys</h3>
      <div class="row" style="align-items:flex-end">
        <div><label>Client</label><select id="k_client">${opts}</select></div>
        <div style="flex:0"><button class="btn secondary" id="k_load">View keys</button></div>
        <div style="flex:0"><button class="btn" id="k_new">Issue new key</button></div>
      </div>
      <div id="k_new_box"></div>
      <div class="hint">Keys are shown once at creation, stored only as a hash. Your CRM uses them as <span class="mono">Authorization: Bearer wac_live_…</span></div>
    </div>
    <div id="k_list"></div>`;
  async function load(clientId) {
    const { data } = await api(`/apikeys?clientId=${clientId}`);
    const rows = data.map((k) => `<tr><td class="mono">${k.prefix}…</td><td>${badge(k.status)}</td><td>${fmt(k.lastUsedAt)}</td><td>${fmt(k.createdAt)}</td></tr>`).join("");
    $("#k_list").innerHTML = `<div class="panel"><h3>Keys (${data.length})</h3><table><thead><tr><th>Prefix</th><th>Status</th><th>Last used</th><th>Created</th></tr></thead><tbody>${rows || `<tr><td colspan=4 class="muted">No keys</td></tr>`}</tbody></table></div>`;
  }
  $("#k_load").onclick = () => load($("#k_client").value);
  $("#k_new").onclick = async () => {
    try { const r = await api("/apikeys", { method: "POST", body: { clientId: $("#k_client").value } });
      $("#k_new_box").innerHTML = `<div style="margin-top:14px"><label>New key (copy now — shown once)</label><div class="code-pill mono">${r.key}</div></div>`;
      toast("API key issued"); load($("#k_client").value);
    } catch (e) { toast(e.message, true); }
  };
  if (clients.length) load(clients[0].id);
};

boot();
