/**
 * realised.js — Realised Profit page
 */
let TRADES = [];
let searchTerm = "";

function closedList() {
  return withCalc(TRADES)
    .filter((t) => t.status === "Closed")
    .sort((a, b) => new Date(b.exitDate) - new Date(a.exitDate));
}

async function init() {
  try {
    TRADES = await Api.listTrades();
  } catch (e) {
    toast("Could not reach API, showing cached data", true);
    TRADES = Api._localList();
  }
  renderAll();
}

function renderAll() {
  renderKpis();
  renderTable();
}

function renderKpis() {
  const closed = closedList();
  const totalPnl = closed.reduce((s, t) => s + t.pnl, 0);
  const invested = closed.reduce((s, t) => s + (parseFloat(t.investedAmount) || t.entryPrice * t.quantity), 0);
  const totalPct = invested ? (totalPnl / invested) * 100 : 0;
  const wins = closed.filter((t) => t.pnl > 0).length;
  const losses = closed.filter((t) => t.pnl <= 0).length;
  const winRate = closed.length ? (wins / closed.length) * 100 : 0;

  document.getElementById("kpiRow").innerHTML = `
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Total Realised P&amp;L</span><span class="kt-icon">📗</span></div>
      <div class="kt-val ${totalPnl >= 0 ? "pos" : "neg"}">${totalPnl >= 0 ? "+" : ""}${fmtINR(totalPnl)}</div>
      <div class="kt-sub ${totalPct >= 0 ? "pos" : "neg"}">${fmtPct(totalPct)}</div>
    </div>
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Winning Trades</span><span class="kt-icon">✅</span></div>
      <div class="kt-val pos">${wins}</div>
      <div class="kt-sub">Closed profitable</div>
    </div>
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Losing Trades</span><span class="kt-icon">❌</span></div>
      <div class="kt-val neg">${losses}</div>
      <div class="kt-sub">Closed at a loss</div>
    </div>
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Win Rate</span><span class="kt-icon">🎯</span></div>
      <div class="kt-val">${winRate.toFixed(1)}%</div>
      <div class="kt-sub">${closed.length} closed trades</div>
    </div>`;
}

function holdingDays(t) {
  if (!t.entryDate || !t.exitDate) return "—";
  const ms = new Date(t.exitDate) - new Date(t.entryDate);
  return Math.max(1, Math.round(ms / 86400000));
}

function renderTable() {
  let arr = closedList();
  if (searchTerm) {
    arr = arr.filter((t) => t.symbol.toLowerCase().includes(searchTerm.toLowerCase()));
  }
  const table = document.getElementById("realisedTable");
  if (!arr.length) {
    table.innerHTML = "";
    table.parentElement.querySelector(".empty-state")?.remove();
    table.parentElement.insertAdjacentHTML("beforeend", '<div class="empty-state">No closed trades yet.</div>');
    return;
  }
  table.parentElement.querySelector(".empty-state")?.remove();

  table.innerHTML = `
    <thead><tr>
      <th>Date</th><th>Symbol</th><th>Type</th><th>Entry Price</th><th>Exit Price</th><th>Qty</th>
      <th>P&amp;L</th><th>Return %</th><th>Holding Days</th><th>Strategy</th>
    </tr></thead>
    <tbody>${arr.map((t) => `
      <tr>
        <td>${dayLabel(t.exitDate)}</td>
        <td><span class="pill ${t.direction === "Long" ? "long" : "short"}" style="margin-right:6px;">${t.symbol.charAt(0)}</span>${t.symbol}</td>
        <td><span class="pill ${t.direction === "Long" ? "long" : "short"}">${t.direction === "Long" ? "BUY" : "SELL"}</span></td>
        <td>${fmtNum(t.entryPrice)}</td>
        <td>${fmtNum(t.exitPrice)}</td>
        <td>${t.quantity}</td>
        <td class="pnl ${t.pnl >= 0 ? "pos" : "neg"}">${t.pnl >= 0 ? "+" : ""}${fmtINR(t.pnl)}</td>
        <td class="pnl ${t.pnl >= 0 ? "pos" : "neg"}">${fmtPct(t.pnlPct)}</td>
        <td>${holdingDays(t)}</td>
        <td>${t.strategy || "—"}</td>
      </tr>`).join("")}</tbody>`;
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("searchBox")?.addEventListener("input", (e) => {
    searchTerm = e.target.value;
    renderTable();
  });
  document.getElementById("exportCsvBtn")?.addEventListener("click", () => {
    const arr = closedList();
    const headers = ["Date", "Symbol", "Type", "Entry Price", "Exit Price", "Qty", "P&L", "Return %", "Holding Days", "Strategy"];
    const rows = arr.map((t) => [dayLabel(t.exitDate), t.symbol, t.direction, t.entryPrice, t.exitPrice, t.quantity, t.pnl.toFixed(2), t.pnlPct.toFixed(2), holdingDays(t), t.strategy || ""]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "realised-profit-export.csv"; a.click();
    URL.revokeObjectURL(url);
  });
});

initAuthGate(init);
