// Client portal — WhatsApp-style conversation inbox. Talks to /portal/api/* (client session).

const $ = (s) => document.querySelector(s);
async function api(path, opts = {}) {
  const res = await fetch(`/portal/api${path}`, {
    method: opts.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
  return data;
}
function toast(m, e = false) { const t = $("#toast"); t.textContent = m; t.className = "toast" + (e ? " err" : ""); setTimeout(() => (t.className = "toast hide"), 3200); }
const time = (d) => new Date(d).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

let state = { accountId: null, contact: null, accounts: [], pollTimer: null };

// ---- Auth ----
async function boot() {
  try { const me = await api("/me"); showInbox(me); }
  catch { $("#login").classList.remove("hide"); $("#portal").classList.add("hide"); }
}
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try { const r = await api("/login", { method: "POST", body: { email: $("#email").value, password: $("#password").value } }); showInbox(r.client); }
  catch (err) { toast(err.message, true); }
});
$("#logout").addEventListener("click", async () => { await api("/logout", { method: "POST" }); location.reload(); });

async function showInbox(me) {
  $("#login").classList.add("hide");
  $("#portal").classList.remove("hide");
  $("#who").textContent = me.name;
  const { data } = await api("/accounts");
  state.accounts = data;
  const sel = $("#acctSel");
  sel.innerHTML = data.map((a) => `<option value="${a.id}">${a.displayPhoneNumber || a.phoneNumberId} (${a.status})</option>`).join("") || `<option>No numbers yet</option>`;
  sel.onchange = () => selectAccount(sel.value);
  if (data.length) selectAccount(data[0].id);
  // Live-ish: refresh the open thread + thread list every 5s.
  clearInterval(state.pollTimer);
  state.pollTimer = setInterval(refresh, 5000);
  // Deep-link to a tab (?tab=auto).
  if (new URLSearchParams(location.search).get("tab") === "auto") {
    document.querySelector('.ptab[data-tab="auto"]').click();
  }
}

async function selectAccount(accountId) {
  state.accountId = accountId; state.contact = null;
  $("#chatWho").textContent = "Select a conversation";
  $("#chatBody").innerHTML = `<div class="empty">Pick a conversation on the left.</div>`;
  await loadThreads();
  loadQuota();
}

async function loadThreads() {
  if (!state.accountId) return;
  const { data } = await api(`/conversations?accountId=${state.accountId}`);
  $("#threads").innerHTML = data.length ? data.map((t) => `
    <div class="thread ${t.contact === state.contact ? "active" : ""}" data-contact="${t.contact}">
      <div class="top"><span class="name">${t.contact}</span><span class="time">${time(t.lastAt)}</span></div>
      <div class="snippet">${t.lastDirection === "OUTBOUND" ? "↩ " : ""}${escapeHtml(t.lastMessage)}</div>
    </div>`).join("") : `<div class="empty" style="padding:20px;font-size:13px">No conversations yet.</div>`;
  document.querySelectorAll(".thread").forEach((el) => el.onclick = () => openThread(el.dataset.contact));
}

async function openThread(contact) {
  state.contact = contact;
  document.querySelectorAll(".thread").forEach((el) => el.classList.toggle("active", el.dataset.contact === contact));
  $("#chatWho").textContent = contact;
  const { data } = await api(`/conversations/${encodeURIComponent(contact)}?accountId=${state.accountId}`);
  renderMessages(data);
  // WhatsApp's 24h rule: free-form text only delivers within 24h of the customer's last message.
  const lastInbound = [...data].reverse().find((m) => m.direction === "INBOUND");
  const within24h = lastInbound && Date.now() - new Date(lastInbound.at).getTime() < 24 * 3600 * 1000;
  const note = $("#note");
  if (!within24h) { note.classList.remove("hide"); note.textContent = "⚠ Outside the 24-hour window — free-text replies may not deliver until the customer messages again. Use a template for the first contact."; }
  else note.classList.add("hide");
}

function renderMessages(msgs) {
  const body = $("#chatBody");
  body.innerHTML = msgs.length ? msgs.map((m) => `
    <div class="bubble ${m.direction === "INBOUND" ? "in" : "out"} ${m.status === "FAILED" ? "fail" : ""}">
      ${escapeHtml(m.text)}
      <div class="meta">${time(m.at)}${m.direction === "OUTBOUND" ? " · " + m.status : ""}</div>
    </div>`).join("") : `<div class="empty">No messages yet.</div>`;
  body.scrollTop = body.scrollHeight;
}

$("#composer").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = $("#msg").value.trim();
  if (!text || !state.contact) return;
  $("#msg").value = "";
  try { await api("/messages/send", { method: "POST", body: { accountId: state.accountId, to: state.contact, body: text } }); await openThread(state.contact); loadThreads(); }
  catch (err) { toast(err.message, true); }
});

async function loadQuota() {
  try { const q = await api(`/usage?accountId=${state.accountId}`); $("#quota").textContent = `${q.used}/${q.quota} this cycle`; }
  catch { $("#quota").textContent = ""; }
}

async function refresh() {
  if (!state.accountId) return;
  await loadThreads();
  if (state.contact) {
    const { data } = await api(`/conversations/${encodeURIComponent(state.contact)}?accountId=${state.accountId}`);
    renderMessages(data);
  }
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

// ---- Tabs: Inbox vs Automations ----
document.querySelectorAll(".ptab").forEach((b) => b.onclick = () => {
  document.querySelectorAll(".ptab").forEach((x) => x.classList.toggle("active", x === b));
  const auto = b.dataset.tab === "auto";
  $("#inboxView").classList.toggle("hide", auto);
  $("#autoView").classList.toggle("hide", !auto);
  $("#acctWrap").classList.toggle("hide", auto);
  $("#threads").classList.toggle("hide", auto);
  if (auto) loadAutomations();
});

const RULE_LABELS = {
  WELCOME: "Welcome message", KEYWORD: "Keyword auto-reply", AWAY: "Away / business-hours",
  OPT_OUT: "Opt-out (STOP) handling", AI: "AI auto-reply",
};

async function loadAutomations() {
  const view = $("#autoView");
  view.innerHTML = `<div class="muted">Loading…</div>`;
  const { data, aiAvailable } = await api("/automations");
  const byType = {};
  data.forEach((r) => (byType[r.type] = r));

  const card = (type, body, rule) => `
    <div class="panel">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0">${RULE_LABELS[type]}</h3>
        <label style="margin:0;display:flex;align-items:center;gap:8px">
          <input type="checkbox" style="width:auto" ${rule?.enabled ? "checked" : ""} data-toggle="${type}"> ${rule ? (rule.enabled ? "On" : "Off") : "Off"}
        </label>
      </div>
      ${body}
      <button class="btn" style="margin-top:12px" data-save="${type}">${rule ? "Update" : "Create"} rule</button>
    </div>`;

  view.innerHTML = `
    <h2 style="margin:0 0 6px">Automations</h2>
    <p class="muted" style="margin:0 0 18px">Auto-replies that run when a customer messages you. They fire within the 24-hour window.</p>

    ${card("WELCOME", `
      <label>Message sent the first time a new contact messages you</label>
      <textarea id="a_welcome" rows="2">${esc(byType.WELCOME?.config.message)}</textarea>`, byType.WELCOME)}

    ${card("KEYWORD", `
      <label>Keywords (comma-separated) — if the message contains any, send the reply</label>
      <input id="k_words" value="${esc(arr(byType.KEYWORD?.config.keywords))}" placeholder="price, pricing, cost">
      <label>Reply</label>
      <textarea id="k_reply" rows="2">${esc(byType.KEYWORD?.config.reply)}</textarea>`, byType.KEYWORD)}

    ${card("AWAY", `
      <label>Message when it's outside business hours</label>
      <textarea id="aw_msg" rows="2">${esc(byType.AWAY?.config.message)}</textarea>
      <div class="row">
        <div><label>Open hour (0-23, Mon–Fri)</label><input id="aw_start" type="number" value="${byType.AWAY?.config.startHour ?? 9}"></div>
        <div><label>Close hour (0-23)</label><input id="aw_end" type="number" value="${byType.AWAY?.config.endHour ?? 17}"></div>
        <div><label>Timezone</label><input id="aw_tz" value="${esc(byType.AWAY?.config.timezone) || "Asia/Kolkata"}"></div>
      </div>`, byType.AWAY)}

    ${card("OPT_OUT", `
      <label>Stop keywords (comma-separated)</label>
      <input id="o_words" value="${esc(arr(byType.OPT_OUT?.config.keywords)) || "STOP, UNSUBSCRIBE"}">
      <label>Confirmation reply</label>
      <textarea id="o_msg" rows="2">${esc(byType.OPT_OUT?.config.confirmMessage) || "You've been unsubscribed. Reply START to opt back in."}</textarea>`, byType.OPT_OUT)}

    ${card("AI", `
      ${aiAvailable ? "" : `<div class="note" style="margin:0 0 10px">⚠ AI replies need an ANTHROPIC_API_KEY configured by your provider.</div>`}
      <label>Instructions for the AI (its persona / what it should do)</label>
      <textarea id="ai_sys" rows="3">${esc(byType.AI?.config.systemPrompt) || "You are a friendly support agent for our business. Answer questions about our products and hours. If unsure, offer to connect a human."}</textarea>
      <label>Model</label>
      <select id="ai_model">
        <option value="claude-opus-4-8" ${(byType.AI?.config.model||"claude-opus-4-8")==="claude-opus-4-8"?"selected":""}>claude-opus-4-8 (smartest)</option>
        <option value="claude-haiku-4-5" ${byType.AI?.config.model==="claude-haiku-4-5"?"selected":""}>claude-haiku-4-5 (fast & cheap)</option>
      </select>
      <div class="hint">AI runs only if no welcome/keyword/away rule matched first.</div>`, byType.AI)}
  `;

  // wire toggles + saves
  view.querySelectorAll("[data-toggle]").forEach((cb) => cb.onchange = async () => {
    const r = byType[cb.dataset.toggle];
    if (!r) return; // not created yet — toggling does nothing until saved
    try { await api(`/automations/${r.id}`, { method: "PATCH", body: { enabled: cb.checked } }); toast(cb.checked ? "Enabled" : "Disabled"); loadAutomations(); }
    catch (e) { toast(e.message, true); }
  });
  view.querySelectorAll("[data-save]").forEach((b) => b.onclick = () => saveRule(b.dataset.save, byType[b.dataset.save]));
}

function configFor(type) {
  if (type === "WELCOME") return { message: $("#a_welcome").value };
  if (type === "KEYWORD") return { keywords: csv($("#k_words").value), match: "contains", reply: $("#k_reply").value };
  if (type === "AWAY") return { message: $("#aw_msg").value, timezone: $("#aw_tz").value, startHour: Number($("#aw_start").value), endHour: Number($("#aw_end").value), hours: weekdayHours(Number($("#aw_start").value), Number($("#aw_end").value)) };
  if (type === "OPT_OUT") return { keywords: csv($("#o_words").value), confirmMessage: $("#o_msg").value };
  if (type === "AI") return { systemPrompt: $("#ai_sys").value, model: $("#ai_model").value };
  return {};
}
function weekdayHours(start, end) { return [1, 2, 3, 4, 5].map((day) => ({ day, start: pad(start) + ":00", end: pad(end) + ":00" })); }
const pad = (n) => String(n).padStart(2, "0");

async function saveRule(type, existing) {
  const config = configFor(type);
  try {
    if (existing) { await api(`/automations/${existing.id}`, { method: "PATCH", body: { config } }); toast("Rule updated"); }
    else { await api("/automations", { method: "POST", body: { type, config } }); toast("Rule created — toggle it On"); }
    loadAutomations();
  } catch (e) { toast(e.message, true); }
}

const esc = (s) => s == null ? "" : escapeHtml(String(s));
const arr = (a) => Array.isArray(a) ? a.join(", ") : "";
const csv = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);

boot();
