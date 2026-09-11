/**
 * utils.js — shared across index.html (Calendar) and open-trades.html (Manager)
 */

/* ---------------- FORMATTERS ---------------- */
const fmtINR = (n) => {
  const sign = n < 0 ? "-" : "";
  return sign + "₹" + Math.abs(Math.round(n)).toLocaleString("en-IN");
};
const fmtPct = (n) => (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
const fmtNum = (n) => Number(n).toLocaleString("en-IN");
const monthKey = (d) => d.slice(0, 7);

function monthLabel(key, short = false) {
  if (!key) return "—";
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("en-US", { month: short ? "short" : "long", year: short ? "2-digit" : "numeric" });
}
function dayLabel(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function timeLabel(dateStr) {
  return new Date(dateStr).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
}

/* ---------------- TRADE MATH ---------------- */
// Single source of truth for pnl on a trade object using the shared schema:
// { entryPrice, quantity, direction: "Long"|"Short", status: "Open"|"Closed", ltp, exitPrice }
function calcTradePnl(t) {
  const entry = parseFloat(t.entryPrice) || 0;
  const qty = parseFloat(t.quantity) || 0;
  const refPrice = t.status === "Closed" ? (parseFloat(t.exitPrice) || 0) : (parseFloat(t.ltp) || entry);
  const gross = t.direction === "Short" ? (entry - refPrice) * qty : (refPrice - entry) * qty;
  const invested = parseFloat(t.investedAmount) || entry * qty || 1;
  const pnlPct = (gross / invested) * 100;
  return { pnl: gross, pnlPct, refPrice };
}
function withCalc(list) {
  return list.map((t) => ({ ...t, ...calcTradePnl(t) }));
}
function rrRatio(t) {
  const entry = parseFloat(t.entryPrice);
  const target = parseFloat(t.targetPrice);
  const sl = parseFloat(t.stopLoss);
  if (!isFinite(entry) || !isFinite(target) || !isFinite(sl)) return null;
  const risk = t.direction === "Short" ? sl - entry : entry - sl;
  const reward = t.direction === "Short" ? entry - target : target - entry;
  if (risk <= 0 || reward <= 0) return null;
  return reward / risk;
}

/* ---------------- MISC HELPERS ---------------- */
function groupBy(list, fn) {
  return list.reduce((acc, item) => {
    const k = fn(item);
    (acc[k] = acc[k] || []).push(item);
    return acc;
  }, {});
}

function sparkPath(values, w, h, pad = 3) {
  if (!values.length) return "";
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / Math.max(1, values.length - 1);
  return values.map((v, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}
function renderSpark(svgEl, values, color) {
  if (!svgEl) return;
  const w = 200, h = 40;
  const d = sparkPath(values, w, h);
  const last = values.length ? values[values.length - 1] : 0;
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const lastX = w - 3, lastY = h - 3 - ((last - min) / range) * (h - 6);
  svgEl.innerHTML = `
    <path d="${d}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${lastX}" cy="${lastY}" r="3" fill="${color}"/>`;
}
function miniRing(canvasId, value, other, color) {
  const ctx = document.getElementById(canvasId)?.getContext("2d");
  if (!ctx) return null;
  return new Chart(ctx, {
    type: "doughnut",
    data: { datasets: [{ data: [value, other], backgroundColor: [color, "#1f2b26"], borderWidth: 0 }] },
    options: { cutout: "70%", plugins: { legend: { display: false }, tooltip: { enabled: false } } },
  });
}

/* ---------------- TOAST ---------------- */
function toast(msg, isErr = false) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.className = "toast show" + (isErr ? " err" : "");
  setTimeout(() => (el.className = "toast"), 2600);
}

/* ---------------- LIVE PRICE SYNC ----------------
   Pulls the latest prices from the existing /dashboard-data feed and updates
   the `ltp` field of matching Open trades. Persists each change to the Worker
   so both pages (Calendar + Open Trades Manager) see the same fresh price
   next time they load. Returns the number of trades updated. */
async function syncLtpFromMarket(trades) {
  const prices = await Api.getMarketPrices();
  if (!prices.length) return 0;

  const priceMap = {};
  prices.forEach((p) => {
    if (p && p.symbol && isFinite(p.currentPrice)) priceMap[String(p.symbol).toUpperCase()] = p.currentPrice;
  });

  const updates = [];
  trades.forEach((t) => {
    if (t.status !== "Open") return;
    const newLtp = priceMap[String(t.symbol || "").toUpperCase()];
    if (newLtp === undefined || newLtp === t.ltp) return;
    t.ltp = newLtp; // update in place so the caller's array reflects it immediately
    updates.push(Api.updateTrade(t.id, { ltp: newLtp }).catch((e) => console.warn("LTP sync failed for", t.symbol, e.message)));
  });

  if (updates.length) await Promise.all(updates);
  return updates.length;
}

/* ---------------- MANDATORY LOGIN GATE ----------------
   Both pages call initAuthGate(onReady) on load. If a token already exists,
   onReady() fires immediately. Otherwise the login modal (markup expected
   in every page, ids below) blocks until a successful login. */
function initAuthGate(onReady) {
  const overlay = document.getElementById("authModalOverlay");
  const submitBtn = document.getElementById("authSubmit");
  const errBox = document.getElementById("authError");

  function openGate() {
    document.getElementById("authError").textContent = "";
    overlay.classList.add("active");
  }

  submitBtn.addEventListener("click", async () => {
    const form = document.getElementById("authForm");
    if (!form.reportValidity()) return;
    const username = document.getElementById("authUsername").value.trim();
    const password = document.getElementById("authPassword").value;
    errBox.textContent = "";
    try {
      await Api.login(username, password);
      overlay.classList.remove("active");
      toast("Signed in");
      onReady();
    } catch (e) {
      errBox.textContent = e.message;
    }
  });
  document.getElementById("authForm").addEventListener("submit", (e) => {
    e.preventDefault();
    submitBtn.click();
  });

  if (Api.user()) {
    onReady();
  } else {
    openGate();
  }

  // Session expired / token invalid mid-use: force re-login instead of
  // silently failing every subsequent request.
  document.addEventListener("auth:expired", () => {
    if (overlay.classList.contains("active")) return; // already showing the gate
    toast("Your session expired — please sign in again.", true);
    openGate();
  });

  return { openGate };
}