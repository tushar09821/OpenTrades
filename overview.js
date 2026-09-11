/**
 * overview.js — Strategy Overview (dashboard) page
 */
let TRADES = [];
let SETTINGS = { initialCapital: 500000 };
let chartInstance = null;
let rangeDays = 7;

async function init() {
  await initAuthGate(boot);
}

async function boot() {
  try {
    [TRADES, SETTINGS] = await Promise.all([Api.listTrades(), Api.getSettings()]);
  } catch (e) {
    toast("Could not reach API, showing cached data", true);
    TRADES = Api._localList();
    SETTINGS = Api._localSettings();
  }
  renderAll();
}

function openList() { return withCalc(TRADES).filter((t) => t.status === "Open"); }
function closedList() { return withCalc(TRADES).filter((t) => t.status === "Closed"); }

function renderAll() {
  renderKpis();
  renderPortfolioChart();
  renderPerformance();
}

/* ---------------- KPI row ---------------- */
function renderKpis() {
  const initialCapital = parseFloat(SETTINGS.initialCapital) || 0;
  const realised = closedList().reduce((s, t) => s + t.pnl, 0);
  const openPnl = openList().reduce((s, t) => s + t.pnl, 0);
  const currentCapital = initialCapital + realised + openPnl;
  const realisedPct = initialCapital ? (realised / initialCapital) * 100 : 0;
  const openInvested = openList().reduce((s, t) => s + (parseFloat(t.investedAmount) || t.entryPrice * t.quantity), 0);
  const openPct = openInvested ? (openPnl / openInvested) * 100 : 0;

  document.getElementById("kpiRow").innerHTML = `
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Initial Capital</span><span class="kt-icon">🏦</span></div>
      <div class="kt-val">${fmtINR(initialCapital)}</div>
      <div class="kt-sub">Starting balance</div>
    </div>
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Current Capital</span><span class="kt-icon">💰</span></div>
      <div class="kt-val">${fmtINR(currentCapital)}</div>
      <div class="kt-sub ${currentCapital >= initialCapital ? "pos" : "neg"}">${fmtPct(initialCapital ? ((currentCapital - initialCapital) / initialCapital) * 100 : 0)}</div>
    </div>
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Realised P&amp;L</span><span class="kt-icon">📗</span></div>
      <div class="kt-val ${realised >= 0 ? "pos" : "neg"}">${realised >= 0 ? "+" : ""}${fmtINR(realised)}</div>
      <div class="kt-sub ${realised >= 0 ? "pos" : "neg"}">${fmtPct(realisedPct)}</div>
    </div>
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Open P&amp;L</span><span class="kt-icon">📈</span></div>
      <div class="kt-val ${openPnl >= 0 ? "pos" : "neg"}">${openPnl >= 0 ? "+" : ""}${fmtINR(openPnl)}</div>
      <div class="kt-sub ${openPnl >= 0 ? "pos" : "neg"}">${fmtPct(openPct)}</div>
    </div>`;
}

/* ---------------- Portfolio Value chart ---------------- */
function buildEquitySeries(days) {
  const initialCapital = parseFloat(SETTINGS.initialCapital) || 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const labels = [];
  const values = [];
  const closed = closedList();
  const openUnrealised = openList().reduce((s, t) => s + t.pnl, 0);

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const realisedToDate = closed
      .filter((t) => t.exitDate && new Date(t.exitDate) <= d)
      .reduce((s, t) => s + t.pnl, 0);
    const isToday = i === 0;
    values.push(initialCapital + realisedToDate + (isToday ? openUnrealised : 0));
    labels.push(d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }));
  }
  return { labels, values };
}

function renderPortfolioChart() {
  const { labels, values } = buildEquitySeries(rangeDays);
  const ctx = document.getElementById("portfolioChart").getContext("2d");
  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
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
        pointBorderColor: "#0a1016",
        fill: true,
        tension: 0.35,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#7f93a3", font: { size: 10.5 } } },
        y: {
          grid: { color: "rgba(255,255,255,0.05)" },
          ticks: {
            color: "#7f93a3",
            font: { size: 10.5 },
            callback: (v) => (v >= 100000 ? (v / 100000).toFixed(2) + "M" : fmtNum(v)),
          },
        },
      },
    },
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const sel = document.getElementById("rangeSelect");
  sel?.addEventListener("change", (e) => {
    rangeDays = parseInt(e.target.value, 10);
    document.getElementById("rangeLabel").textContent = `Last ${rangeDays} days`;
    renderPortfolioChart();
  });
  document.getElementById("refreshBtn")?.addEventListener("click", () => boot());
  document.getElementById("qaAddTrade")?.addEventListener("click", () => {
    window.location.href = "open-trades.html?add=1";
  });
});

/* ---------------- Performance panel ---------------- */
function renderPerformance() {
  const closed = closedList();
  const total = TRADES.length;
  const wins = closed.filter((t) => t.pnl > 0).length;
  const losses = closed.filter((t) => t.pnl <= 0).length;
  const winRate = closed.length ? (wins / closed.length) * 100 : 0;
  const avgReturn = closed.length ? closed.reduce((s, t) => s + t.pnlPct, 0) / closed.length : 0;

  document.getElementById("perfStats").innerHTML = `
    <div class="stat-row"><span class="stat-label">Win Rate</span><span class="stat-val">${winRate.toFixed(1)}%</span></div>
    <div class="stat-row"><span class="stat-label">Total Trades</span><span class="stat-val">${total}</span></div>
    <div class="stat-row"><span class="stat-label">Winning Trades</span><span class="stat-val pos">${wins}</span></div>
    <div class="stat-row"><span class="stat-label">Losing Trades</span><span class="stat-val neg">${losses}</span></div>
    <div class="stat-row"><span class="stat-label">Avg. Return (per trade)</span><span class="stat-val ${avgReturn >= 0 ? "pos" : "neg"}">${fmtPct(avgReturn)}</span></div>`;
}

init();