/**
 * overview.js — Overview (dashboard) page
 */
let TRADES = [];
let SETTINGS = { initialCapital: 500000 };
let chartInstance = null;
let donutInstance = null;
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
function investedOf(t) { return parseFloat(t.investedAmount) || (parseFloat(t.entryPrice) || 0) * (parseFloat(t.quantity) || 0); }

function renderAll() {
  renderKpis();
  renderPortfolioChart();
  renderPnlDonut();
  renderInfoGrid();
}

/* ---------------- KPI row ---------------- */
function renderKpis() {
  const closed = closedList();
  const open = openList();
  const initialCapital = parseFloat(SETTINGS.initialCapital) || 0;
  // "Total Invested" = capital currently deployed right now, i.e. only the
  // open positions. Summing closed trades too (the old bug) kept counting
  // capital that has already been returned/realised and no longer sits in
  // any position, wildly inflating this number.
  const totalInvested = open.reduce((s, t) => s + investedOf(t), 0);
  const totalRealised = closed.reduce((s, t) => s + t.pnl, 0);
  const unrealised = open.reduce((s, t) => s + t.pnl, 0);
  // Realised P&L and portfolio growth are both measured against the
  // account's starting capital, not against the (much smaller/larger,
  // constantly-changing) amount currently invested in open positions.
  const realisedPct = initialCapital ? (totalRealised / initialCapital) * 100 : 0;
  const currentValue = initialCapital + totalRealised + unrealised;
  const growthPct = initialCapital ? ((currentValue - initialCapital) / initialCapital) * 100 : 0;
  const wins = closed.filter((t) => t.pnl > 0).length;
  const winRate = closed.length ? (wins / closed.length) * 100 : 0;
  const avgProfit = closed.length ? totalRealised / closed.length : 0;
  const avgProfitPct = closed.length ? closed.reduce((s, t) => s + t.pnlPct, 0) / closed.length : 0;

  document.getElementById("kpiRow").innerHTML = `
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Total Realised P&amp;L</span><span class="kt-icon-badge" style="background:var(--green-soft);color:var(--green);">📗</span></div>
      <div class="kt-val ${totalRealised >= 0 ? "pos" : "neg"}">${totalRealised >= 0 ? "+" : ""}${fmtINR(totalRealised)}</div>
      <div class="kt-sub ${totalRealised >= 0 ? "pos" : "neg"}">${fmtPct(realisedPct)}</div>
    </div>
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Total Invested</span><span class="kt-icon-badge" style="background:var(--yellow-soft);color:var(--yellow);">👛</span></div>
      <div class="kt-val">${fmtINR(totalInvested)}</div>
      <div class="kt-sub">—</div>
    </div>
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Current Portfolio Value</span><span class="kt-icon-badge" style="background:var(--accent-soft);color:var(--accent);">💎</span></div>
      <div class="kt-val">${fmtINR(currentValue)}</div>
      <div class="kt-sub ${growthPct >= 0 ? "pos" : "neg"}">${fmtPct(growthPct)}</div>
    </div>
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Win Rate</span><span class="kt-icon-badge" style="background:var(--blue-soft);color:var(--blue);">🎯</span></div>
      <div class="kt-val">${winRate.toFixed(1)}%</div>
      <div class="kt-sub">(${wins}/${closed.length} trades)</div>
    </div>
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Avg. Profit (per trade)</span><span class="kt-icon-badge" style="background:var(--purple-soft);color:var(--purple);">📊</span></div>
      <div class="kt-val ${avgProfit >= 0 ? "pos" : "neg"}">${fmtINR(avgProfit)}</div>
      <div class="kt-sub ${avgProfitPct >= 0 ? "pos" : "neg"}">${fmtPct(avgProfitPct)}</div>
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
        pointBorderColor: "#0a0e14",
        fill: true,
        tension: 0.35,
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
          ticks: {
            color: "#8998a9",
            font: { size: 10.5 },
            callback: (v) => (v >= 100000 ? (v / 100000).toFixed(2) + "L" : fmtNum(v)),
          },
        },
      },
    },
  });

  const pill = document.getElementById("chartValuePill");
  if (pill) pill.textContent = fmtINR(values[values.length - 1] || 0);
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("rangeTabs")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-days]");
    if (!btn) return;
    rangeDays = parseInt(btn.dataset.days, 10);
    document.querySelectorAll("#rangeTabs button").forEach((b) => b.classList.toggle("active", b === btn));
    renderPortfolioChart();
  });
  document.getElementById("refreshBtn")?.addEventListener("click", () => boot());
  document.getElementById("qaAddTrade")?.addEventListener("click", () => {
    window.location.href = "open-trades.html?add=1";
  });
});

/* ---------------- P&L Breakdown donut ---------------- */
function renderPnlDonut() {
  const closed = closedList();
  const wins = closed.filter((t) => t.pnl > 0).length;
  const losses = closed.length - wins;
  const winRate = closed.length ? (wins / closed.length) * 100 : 0;
  const lossRate = closed.length ? (losses / closed.length) * 100 : 0;
  const totalPnl = closed.reduce((s, t) => s + t.pnl, 0);

  document.getElementById("donutWinRate").textContent = closed.length ? winRate.toFixed(0) + "%" : "—";
  document.getElementById("donutTotalPnl").innerHTML = `<span class="${totalPnl >= 0 ? "pos" : "neg"}">${totalPnl >= 0 ? "+" : ""}${fmtINR(totalPnl)}</span>`;

  document.getElementById("pnlLegend").innerHTML = `
    <div class="legend-row">
      <span class="lg-left"><span class="dot" style="background:var(--green);"></span>Profitable Trades</span>
      <span class="lg-val pos">${winRate.toFixed(1)}%</span>
    </div>
    <div class="legend-row">
      <span class="lg-left"><span class="dot" style="background:var(--red);"></span>Losing Trades</span>
      <span class="lg-val neg">${lossRate.toFixed(1)}%</span>
    </div>`;

  const ctx = document.getElementById("pnlDonut").getContext("2d");
  if (donutInstance) donutInstance.destroy();
  donutInstance = new Chart(ctx, {
    type: "doughnut",
    data: {
      datasets: [{
        data: closed.length ? [wins, losses] : [1],
        backgroundColor: closed.length ? ["#22c55e", "#f43f5e"] : ["#212b38"],
        borderWidth: 0,
      }],
    },
    options: { cutout: "72%", plugins: { legend: { display: false }, tooltip: { enabled: closed.length > 0 } } },
  });
}

/* ---------------- Info tile row ---------------- */
function aggregateSimple(list, keyFn) {
  const map = {};
  list.forEach((t) => {
    const k = keyFn(t);
    if (!map[k]) map[k] = { key: k, trades: [] };
    map[k].trades.push(t);
  });
  return Object.values(map).map((g) => {
    const netPnl = g.trades.reduce((s, t) => s + t.pnl, 0);
    const avgPct = g.trades.reduce((s, t) => s + t.pnlPct, 0) / g.trades.length;
    return { key: g.key, count: g.trades.length, netPnl, avgPct };
  });
}

function renderInfoGrid() {
  const closed = closedList();
  const open = openList();

  const bySymbol = aggregateSimple(closed, (t) => t.symbol);
  const bySector = aggregateSimple(closed, (t) => sectorOf(t.symbol));

  const topSymbol = bySymbol.length ? bySymbol.reduce((m, r) => (r.netPnl > m.netPnl ? r : m)) : null;
  const worstSymbol = bySymbol.length ? bySymbol.reduce((m, r) => (r.netPnl < m.netPnl ? r : m)) : null;
  const bestSector = bySector.length ? bySector.reduce((m, r) => (r.netPnl > m.netPnl ? r : m)) : null;

  const openWinning = open.filter((t) => t.pnl > 0).length;
  const openLosing = open.length - openWinning;

  const symAv = topSymbol ? avatarStyle(topSymbol.key) : { bg: "var(--panel-3)", fg: "var(--muted)" };
  const worstAv = worstSymbol ? avatarStyle(worstSymbol.key) : { bg: "var(--panel-3)", fg: "var(--muted)" };
  const sectorAv = bestSector ? avatarStyle(bestSector.key) : { bg: "var(--panel-3)", fg: "var(--muted)" };

  document.getElementById("infoGrid").innerHTML = `
    <div class="info-tile">
      <span class="it-avatar" style="background:${symAv.bg};color:${symAv.fg};">${topSymbol ? topSymbol.key.charAt(0).toUpperCase() : "—"}</span>
      <span class="it-body">
        <div class="it-label">Top Performing Symbol</div>
        <div class="it-value">${topSymbol ? topSymbol.key : "—"}</div>
        <div class="it-sub pos">${topSymbol ? fmtINR(topSymbol.netPnl) : "—"} ${topSymbol ? fmtPct(topSymbol.avgPct) : ""}</div>
      </span>
    </div>
    <div class="info-tile">
      <span class="it-avatar" style="background:${sectorAv.bg};color:${sectorAv.fg};">${bestSector ? bestSector.key.charAt(0).toUpperCase() : "—"}</span>
      <span class="it-body">
        <div class="it-label">Best Sector</div>
        <div class="it-value">${bestSector ? bestSector.key : "—"}</div>
        <div class="it-sub pos">${bestSector ? fmtPct(bestSector.avgPct) : "—"}</div>
      </span>
    </div>
    <div class="info-tile">
      <span class="it-avatar" style="background:${worstAv.bg};color:${worstAv.fg};">${worstSymbol ? worstSymbol.key.charAt(0).toUpperCase() : "—"}</span>
      <span class="it-body">
        <div class="it-label">Worst Performing Symbol</div>
        <div class="it-value">${worstSymbol ? worstSymbol.key : "—"}</div>
        <div class="it-sub neg">${worstSymbol ? fmtINR(worstSymbol.netPnl) : "—"} ${worstSymbol ? fmtPct(worstSymbol.avgPct) : ""}</div>
      </span>
    </div>
    <a class="info-tile clickable" href="open-trades.html">
      <span class="it-avatar" style="background:var(--accent-soft);color:var(--accent);">📈</span>
      <span class="it-body">
        <div class="it-label">Active Trades</div>
        <div class="it-value">${open.length}</div>
        <div class="it-sub muted">${openWinning} Winning | ${openLosing} Losing</div>
      </span>
      <span class="it-chevron">›</span>
    </a>`;
}

init();