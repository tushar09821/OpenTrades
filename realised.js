/**
 * realised.js — Realised Profit page
 */
let TRADES = [];
let searchTerm = "";
let equityChartInstance = null;
let sectorDonutInstance = null;

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
  renderEquityCurve();
  renderSectorDonut();
  renderTable();
}

function renderKpis() {
  const closed = closedList();
  const totalPnl = closed.reduce((s, t) => s + t.pnl, 0);
  const invested = closed.reduce((s, t) => s + (parseFloat(t.investedAmount) || t.entryPrice * t.quantity), 0);
  const totalPct = invested ? (totalPnl / invested) * 100 : 0;
  const wins = closed.filter((t) => t.pnl > 0).length;
  const losses = closed.filter((t) => t.pnl <= 0).length;
  const avgProfit = closed.length ? totalPnl / closed.length : 0;
  const avgProfitPct = closed.length ? closed.reduce((s, t) => s + t.pnlPct, 0) / closed.length : 0;
  const maxLossTrade = closed.reduce((m, t) => (!m || t.pnl < m.pnl ? t : m), null);

  document.getElementById("kpiRow").innerHTML = `
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Total Realised P&amp;L</span><span class="kt-icon-badge" style="background:var(--green-soft);color:var(--green);">📗</span></div>
      <div class="kt-val ${totalPnl >= 0 ? "pos" : "neg"}">${totalPnl >= 0 ? "+" : ""}${fmtINR(totalPnl)}</div>
      <div class="kt-sub ${totalPct >= 0 ? "pos" : "neg"}">${fmtPct(totalPct)}</div>
    </div>
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Total Trades</span><span class="kt-icon-badge" style="background:var(--blue-soft);color:var(--blue);">📄</span></div>
      <div class="kt-val">${closed.length}</div>
      <div class="kt-sub">(${wins}W / ${losses}L)</div>
    </div>
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Avg. Profit (per trade)</span><span class="kt-icon-badge" style="background:var(--purple-soft);color:var(--purple);">📈</span></div>
      <div class="kt-val ${avgProfit >= 0 ? "pos" : "neg"}">${fmtINR(avgProfit)}</div>
      <div class="kt-sub ${avgProfitPct >= 0 ? "pos" : "neg"}">${fmtPct(avgProfitPct)}</div>
    </div>
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Max Loss (single trade)</span><span class="kt-icon-badge" style="background:var(--red-soft);color:var(--red);">⚠️</span></div>
      <div class="kt-val neg">${maxLossTrade && maxLossTrade.pnl < 0 ? fmtINR(maxLossTrade.pnl) : "—"}</div>
      <div class="kt-sub">${maxLossTrade && maxLossTrade.pnl < 0 ? `(${maxLossTrade.symbol})` : "No losers yet"}</div>
    </div>`;
}

/* ---------------- Equity Curve ---------------- */
function renderEquityCurve() {
  const closed = [...closedList()].sort((a, b) => new Date(a.exitDate) - new Date(b.exitDate));
  let running = 0;
  const labels = [];
  const values = [];
  closed.forEach((t) => {
    running += t.pnl;
    labels.push(dayLabel(t.exitDate));
    values.push(running);
  });
  if (!labels.length) { labels.push("—"); values.push(0); }

  const ctx = document.getElementById("equityChart").getContext("2d");
  if (equityChartInstance) equityChartInstance.destroy();
  equityChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: "#17b6a4",
        backgroundColor: "rgba(23,182,164,0.12)",
        borderWidth: 2.4,
        pointRadius: 3,
        pointBackgroundColor: "#17b6a4",
        pointBorderColor: "#0a0e14",
        fill: true,
        tension: 0.3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#8998a9", font: { size: 10.5 } } },
        y: {
          grid: { color: "rgba(255,255,255,0.05)" },
          ticks: { color: "#8998a9", font: { size: 10.5 }, callback: (v) => fmtNum(v) },
        },
      },
    },
  });
}

/* ---------------- Profit by Sectors donut ---------------- */
function renderSectorDonut() {
  const closed = closedList();
  const map = {};
  closed.forEach((t) => {
    const sec = sectorOf(t.symbol);
    map[sec] = (map[sec] || 0) + Math.max(0, t.pnl);
  });
  let entries = Object.entries(map).filter(([, v]) => v > 0);
  entries.sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const totalPnl = closed.reduce((s, t) => s + t.pnl, 0);

  document.getElementById("sectorDonutVal").innerHTML = `<span class="${totalPnl >= 0 ? "pos" : "neg"}">${fmtINR(totalPnl)}</span>`;

  document.getElementById("sectorLegend").innerHTML = entries.length
    ? entries.map(([sec, val], i) => `
      <div class="legend-row">
        <span class="lg-left"><span class="dot" style="background:${CHART_PALETTE[i % CHART_PALETTE.length]};"></span>${sec}</span>
        <span class="lg-val">${total ? ((val / total) * 100).toFixed(1) : "0.0"}%</span>
      </div>`).join("")
    : `<div class="empty-state" style="padding:10px 0;">No profitable sectors yet.</div>`;

  const ctx = document.getElementById("sectorDonut").getContext("2d");
  if (sectorDonutInstance) sectorDonutInstance.destroy();
  sectorDonutInstance = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: entries.map(([sec]) => sec),
      datasets: [{
        data: entries.length ? entries.map(([, v]) => v) : [1],
        backgroundColor: entries.length ? entries.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]) : ["#212b38"],
        borderWidth: 0,
      }],
    },
    options: { cutout: "72%", plugins: { legend: { display: false }, tooltip: { enabled: entries.length > 0 } } },
  });
}

function holdingDays(t) {
  if (!t.entryDate || !t.exitDate) return "—";
  const ms = new Date(t.exitDate) - new Date(t.entryDate);
  return Math.max(1, Math.round(ms / 86400000));
}

/* ---------------- Realised Trades table ---------------- */
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
      <th>Date</th><th>Symbol</th><th>Type</th><th>Qty</th><th>Entry Price</th><th>Exit Price</th>
      <th>P&amp;L ₹</th><th>P&amp;L %</th><th>Status</th>
    </tr></thead>
    <tbody>${arr.map((t) => `
      <tr>
        <td>${dayLabel(t.exitDate)}</td>
        <td><div class="sym-cell">${avatarHtml(t.symbol, 26)}${t.symbol}</div></td>
        <td><span class="pill ${t.direction === "Long" ? "sell" : "buy"}">${t.direction === "Long" ? "SELL" : "BUY"}</span></td>
        <td>${t.quantity}</td>
        <td>${fmtNum(t.entryPrice)}</td>
        <td>${fmtNum(t.exitPrice)}</td>
        <td class="pnl ${t.pnl >= 0 ? "pos" : "neg"}">${t.pnl >= 0 ? "+" : "-"}${fmtINR(Math.abs(t.pnl))}</td>
        <td class="pnl ${t.pnl >= 0 ? "pos" : "neg"}">${fmtPct(t.pnlPct)}</td>
        <td><span class="pill closed">Closed</span></td>
      </tr>`).join("")}</tbody>`;
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("searchBox")?.addEventListener("input", (e) => {
    searchTerm = e.target.value;
    renderTable();
  });
  document.getElementById("periodToggle")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-period]");
    if (!btn) return;
    document.querySelectorAll("#periodToggle button").forEach((b) => b.classList.toggle("active", b === btn));
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