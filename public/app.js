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
  // Support deep-linking to a view via ?view=... (falls back to the dashboard).
  const wanted = new URLSearchParams(location.search).get("view");
  navigate(views[wanted] ? wanted : "overview");
}

// ---------------- Navigation ----------------
const titles = {
  overview: "Dashboard", clients: "Clients", accounts: "WhatsApp Accounts",
  billing: "Billing", messaging: "Messaging", templates: "Templates",
  broadcast: "Broadcast", analytics: "Analytics", apikeys: "API Keys",
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
    <td>
      ${c.status === "ACTIVE"
        ? `<button class="btn tiny secondary" data-suspend="${c.id}">Suspend</button>`
        : `<button class="btn tiny" data-activate="${c.id}">Activate</button>`}
      <button class="btn tiny secondary" data-edit='${JSON.stringify({ id: c.id, name: c.name, email: c.email, companyName: c.companyName || "" }).replace(/'/g, "&#39;")}'>Edit</button>
      <button class="btn tiny secondary" data-portal="${c.id}" data-email="${c.email}">Portal login</button>
      <button class="btn tiny danger" data-del="${c.id}" data-name="${c.name}">Delete</button>
    </td>
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
  document.querySelectorAll("[data-edit]").forEach((b) => b.onclick = async () => {
    const c = JSON.parse(b.dataset.edit);
    const name = prompt("Name", c.name); if (name === null) return;
    const email = prompt("Email", c.email); if (email === null) return;
    const companyName = prompt("Company", c.companyName); if (companyName === null) return;
    try { await api(`/clients/${c.id}`, { method: "PATCH", body: { name, email, companyName } }); toast("Client updated"); navigate("clients"); }
    catch (e) { toast(e.message, true); }
  });
  document.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
    if (!confirm(`Delete "${b.dataset.name}" and all their data? This cannot be undone.`)) return;
    try { await api(`/clients/${b.dataset.del}`, { method: "DELETE" }); toast("Client deleted"); navigate("clients"); }
    catch (e) { toast(e.message, true); }
  });
  document.querySelectorAll("[data-portal]").forEach((b) => b.onclick = async () => {
    const pw = prompt(`Set a portal password for ${b.dataset.email}.\nThey'll log in at  /portal  with this email + password.`);
    if (!pw) return;
    try { await api(`/clients/${b.dataset.portal}/portal-password`, { method: "POST", body: { password: pw } });
      toast("Portal login enabled — share: " + location.origin + "/portal"); }
    catch (e) { toast(e.message, true); }
  });
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
      ${a.status !== "DEPROVISIONED" ? `<button class="btn tiny danger" data-deprov="${a.id}">Deprovision</button>` : ""}
    </td>
  </tr>`).join("");
  $("#view").innerHTML = `
    <div class="panel" style="border-color:var(--brand-2)">
      <h3>🔌 Connect a real WhatsApp number (guided)</h3>
      <div class="row">
        <div><label>Client</label><select id="w_client">${opts}</select></div>
        <div><label>WABA ID</label><input id="w_waba" placeholder="WhatsApp Business Account ID"></div>
        <div><label>Phone Number ID</label><input id="w_pnid" placeholder="Meta phone number ID"></div>
      </div>
      <label>Access Token (paste your Meta token — stored encrypted, never shown again)</label>
      <input id="w_token" type="password" placeholder="EAA…">
      <button class="btn" id="w_connect" style="margin-top:12px">Connect &amp; verify</button>
      <div class="hint">Runs provision → health check → template import in one step. Use this for live Meta numbers.</div>
      <div id="w_status" style="margin-top:14px"></div>
    </div>
    <div class="panel"><h3>Provision manually (advanced)</h3>
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
  $("#w_connect").onclick = async () => {
    const btn = $("#w_connect"), box = $("#w_status");
    const waba = $("#w_waba").value.trim(), pnid = $("#w_pnid").value.trim(), token = $("#w_token").value.trim();
    if (!waba || !pnid || !token) return toast("WABA ID, Phone Number ID and Access Token are required", true);
    btn.disabled = true; btn.textContent = "Connecting…";
    box.innerHTML = `<div class="muted">⏳ Provisioning → health check → importing templates…</div>`;
    try {
      const r = await api("/accounts/connect", { method: "POST", body: { clientId: $("#w_client").value, wabaId: waba, phoneNumberId: pnid, accessToken: token } });
      if (r.health.healthy) {
        box.innerHTML = `<div class="panel" style="margin:0;border-color:var(--brand)">
          <div>✅ <b>Connected & verified</b></div>
          <div style="margin-top:8px" class="muted">Display number: <b>${r.health.displayPhoneNumber || "—"}</b> · Verified name: <b>${r.health.verifiedName || "—"}</b> · Quality: ${r.health.qualityRating || "—"}</div>
          <div style="margin-top:6px" class="muted">Templates imported: <b>${r.templates.imported}</b> (updated ${r.templates.updated}). Go to <b>Templates</b> to send <span class="mono">hello_world</span> as your first message.</div>
        </div>`;
        toast("WhatsApp number connected ✓");
      } else {
        box.innerHTML = `<div class="panel" style="margin:0;border-color:var(--danger)">❌ Provisioned but health check failed:<br><span class="muted">${r.health.error || "unknown error"}</span><div class="hint">Check the access token (may be expired) and that the Phone Number ID is correct.</div></div>`;
      }
      setTimeout(() => navigate("accounts"), 4000);
    } catch (e) {
      box.innerHTML = `<div class="panel" style="margin:0;border-color:var(--danger)">❌ ${e.message}</div>`;
    } finally { btn.disabled = false; btn.textContent = "Connect & verify"; }
  };
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
  document.querySelectorAll("[data-deprov]").forEach((b) => b.onclick = async () => {
    if (!confirm("Deprovision this account? It will stop sending/receiving.")) return;
    try { await api(`/accounts/${b.dataset.deprov}/deprovision`, { method: "POST" }); toast("Deprovisioned"); navigate("accounts"); }
    catch (e) { toast(e.message, true); }
  });
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

views.templates = async () => {
  const { data: accounts } = await api("/accounts");
  const opts = accounts.map((a) => `<option value="${a.id}">${a.phoneNumberId} (${a.client?.name || ""}) · ${a.provider}</option>`).join("");
  $("#view").innerHTML = `
    <div class="panel"><h3>Create a template</h3>
      <div class="row">
        <div><label>Account</label><select id="t_acct">${opts}</select></div>
        <div><label>Name</label><input id="t_name" placeholder="order_update"></div>
        <div><label>Language</label><input id="t_lang" value="en_US"></div>
        <div><label>Category</label><select id="t_cat"><option>UTILITY</option><option>MARKETING</option><option>AUTHENTICATION</option></select></div>
      </div>
      <label>Body text (use {{1}}, {{2}} for variables)</label>
      <textarea id="t_body" rows="2" placeholder="Your order {{1}} is {{2}}."></textarea>
      <div style="margin-top:12px"><button class="btn" id="t_create">Create &amp; submit</button>
      <button class="btn secondary" id="t_sync">Sync status from Meta</button></div>
      <div class="hint">On MOCK accounts, use “Approve (test)” to mark a template APPROVED so you can send it. Real templates are approved by Meta — use Sync.</div>
    </div>
    <div class="panel"><h3>Templates</h3>
      <div class="row" style="margin-bottom:12px"><div><label>Account</label><select id="t_lacct">${opts}</select></div><div style="flex:0;align-self:flex-end"><button class="btn secondary" id="t_load">Load</button></div></div>
      <div id="tplBox"><div class="muted">Pick an account and load.</div></div>
    </div>`;
  async function loadTpls(accountId) {
    const { data } = await api(`/templates?accountId=${accountId}`);
    const rows = data.map((t) => `<tr>
      <td>${t.name}<div class="muted mono">${t.language} · ${t.category}</div></td>
      <td>${badge(t.status)}</td>
      <td>
        ${t.status !== "APPROVED" ? `<button class="btn tiny secondary" data-approve="${t.id}">Approve (test)</button>` : ""}
        ${t.status === "APPROVED" ? `<button class="btn tiny" data-tsend="${t.id}" data-tname="${t.name}">Send</button>` : ""}
      </td></tr>`).join("");
    $("#tplBox").innerHTML = `<table><thead><tr><th>Template</th><th>Status</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan=3 class="muted">No templates</td></tr>`}</tbody></table>`;
    document.querySelectorAll("[data-approve]").forEach((b) => b.onclick = async () => { try { await api(`/templates/${b.dataset.approve}/approve`, { method: "POST" }); toast("Approved (test)"); loadTpls(accountId); } catch (e) { toast(e.message, true); } });
    document.querySelectorAll("[data-tsend]").forEach((b) => b.onclick = async () => {
      const to = prompt(`Send "${b.dataset.tname}" to (E.164, no +):`); if (!to) return;
      const vars = prompt('Variables as JSON array (e.g. ["#A1","shipped"]) or leave blank', "[]");
      try { const m = await api(`/templates/${b.dataset.tsend}/send`, { method: "POST", body: { to, variables: JSON.parse(vars || "[]") } }); toast(`Sent (${m.status})`); }
      catch (e) { toast(e.message, true); }
    });
  }
  $("#t_create").onclick = async () => {
    try {
      const body = $("#t_body").value;
      await api("/templates", { method: "POST", body: {
        accountId: $("#t_acct").value, name: $("#t_name").value, language: $("#t_lang").value, category: $("#t_cat").value,
        components: [{ type: "BODY", text: body }],
      } });
      toast("Template created & submitted"); $("#t_lacct").value = $("#t_acct").value; loadTpls($("#t_acct").value);
    } catch (e) { toast(e.message, true); }
  };
  $("#t_sync").onclick = async () => { try { const r = await api("/templates/sync", { method: "POST", body: { accountId: $("#t_acct").value } }); toast(`Synced — ${r.imported} imported, ${r.updated} updated`); loadTpls($("#t_acct").value); } catch (e) { toast(e.message, true); } };
  $("#t_load").onclick = () => loadTpls($("#t_lacct").value);
  if (accounts.length) loadTpls(accounts[0].id);
};

views.broadcast = async () => {
  const { data: accounts } = await api("/accounts");
  // Gather approved templates across the operator's accounts.
  const all = [];
  for (const a of accounts) {
    const { data } = await api(`/templates?accountId=${a.id}`);
    data.filter((t) => t.status === "APPROVED").forEach((t) => all.push({ ...t, acct: a }));
  }
  const opts = all.map((t) => `<option value="${t.id}">${t.name} (${t.acct.phoneNumberId})</option>`).join("");
  $("#view").innerHTML = `
    <div class="panel"><h3>Bulk broadcast (rate-limited)</h3>
      ${all.length ? `
      <label>Approved template</label><select id="b_tpl">${opts}</select>
      <label>Recipients — one per line as <span class="mono">number,var1,var2…</span></label>
      <textarea id="b_rcpts" rows="6" placeholder="911111111111,#A1,shipped
922222222222,#A2,packed"></textarea>
      <button class="btn" id="b_send" style="margin-top:12px">Send broadcast</button>
      <div class="hint">Sends pace to the plan's per-second rate (Meta 24h tier limits still apply). MOCK accounts simulate.</div>
      <div id="b_result"></div>`
      : `<div class="muted">No APPROVED templates yet. Create one under Templates and approve it first.</div>`}
    </div>`;
  const btn = $("#b_send");
  if (btn) btn.onclick = async () => {
    const lines = $("#b_rcpts").value.split("\n").map((l) => l.trim()).filter(Boolean);
    const recipients = lines.map((l) => { const [to, ...vars] = l.split(","); return { to: to.trim(), variables: vars.map((v) => v.trim()) }; });
    if (!recipients.length) return toast("Add at least one recipient", true);
    btn.disabled = true; btn.textContent = "Sending…";
    try {
      const r = await api("/broadcasts", { method: "POST", body: { templateId: $("#b_tpl").value, recipients } });
      $("#b_result").innerHTML = `<div class="panel" style="margin-top:14px"><b>${r.sent}/${r.total}</b> sent, ${r.failed} failed.${r.errors.length ? `<table style="margin-top:8px"><thead><tr><th>To</th><th>Error</th></tr></thead><tbody>${r.errors.map((e) => `<tr><td class="mono">${e.to}</td><td>${e.error}</td></tr>`).join("")}</tbody></table>` : ""}</div>`;
      toast(`Broadcast: ${r.sent}/${r.total} sent`);
    } catch (e) { toast(e.message, true); }
    finally { btn.disabled = false; btn.textContent = "Send broadcast"; }
  };
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
    const metrics = [["Sent", a.totals.sent, "#25d366"], ["Delivered", a.totals.delivered, "#3b82f6"], ["Read", a.totals.read, "#a855f7"], ["Failed", a.totals.failed, "#ef4444"], ["Inbound", a.totals.inbound, "#f59e0b"]];
    const cards = metrics.map(([l, n]) => `<div class="stat"><div class="n">${n}</div><div class="l">${l}</div></div>`).join("");
    const max = Math.max(1, ...metrics.map(([, n]) => n));
    const bars = metrics.map(([l, n, c]) => `
      <div style="display:flex;align-items:center;gap:12px;margin:8px 0">
        <div style="width:80px;color:var(--muted);font-size:13px">${l}</div>
        <div style="flex:1;background:var(--bg);border-radius:6px;overflow:hidden;height:22px">
          <div style="width:${(n / max) * 100}%;height:100%;background:${c};min-width:2px"></div>
        </div>
        <div style="width:42px;text-align:right;font-weight:600">${n}</div>
      </div>`).join("");
    const rows = a.accounts.map((ac) => `<tr><td class="mono">${ac.phoneNumberId}</td><td>${badge(ac.status)}</td><td>${ac.messages.sent}</td><td>${ac.messages.delivered}</td><td>${ac.messages.read}</td><td>${ac.messages.failed}</td><td>${ac.messages.inbound}</td><td>${ac.quota ? ac.quota.used + "/" + ac.quota.quota : "—"}</td></tr>`).join("");
    $("#anBox").innerHTML = `<div class="stats">${cards}</div>
      <div class="panel"><h3>Message breakdown — ${a.clientName}</h3>${bars}</div>
      <div class="panel"><h3>Per account</h3>
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
