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

boot();
