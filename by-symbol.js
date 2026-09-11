/**
 * by-symbol.js — Realised Profit analysed by symbol, side and strategy.
 * Reuses the same trade schema / calcTradePnl from utils.js and the same
 * Api from api.js as every other page in the app.
 */
let TRADES = [];
let sideFilter = "all"; // all | Long | Short
let searchTerm = "";
let currentPage = 1;
const PAGE_SIZE = 10;

// Optional friendly names for common symbols — purely cosmetic, falls back
// to the raw symbol when unknown.
const SYMBOL_NAMES = {
  RELIANCE: "Reliance Industries Limited",
  TCS: "Tata Consultancy Services",
  HDFCBANK: "HDFC Bank Limited",
  ICICIBANK: "ICICI Bank Limited",
  INFY: "Infosys Limited",
  BANKNIFTY: "Bank Nifty Index",
  NIFTY: "Nifty 50 Index",
  AXISBANK: "Axis Bank Limited",
  ITC: "ITC Limited",
  LT: "Larsen & Toubro Limited",
  SBIN: "State Bank of India",
  WIPRO: "Wipro Limited",
  MARUTI: "Maruti Suzuki India Limited",
};
function symbolName(sym) {
  return SYMBOL_NAMES[sym] || "—";
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

function closedList() {
  let arr = withCalc(TRADES).filter((t) => t.status === "Closed");
  if (sideFilter !== "all") arr = arr.filter((t) => t.direction === sideFilter);
  return arr;
}

function renderAll() {
  renderTopKpis();
  renderSymbolTable();
}

/* ==================== TOP-LEVEL KPI ROW ==================== */
function renderTopKpis() {
  const closed = closedList();
  const winners = closed.filter((t) => t.pnl > 0);
  const losers = closed.filter((t) => t.pnl <= 0);
  const totalRealisedProfit = winners.reduce((s, t) => s + t.pnl, 0);
  const totalLoss = losers.reduce((s, t) => s + Math.abs(t.pnl), 0);
  const netProfit = totalRealisedProfit - totalLoss;
  const winRate = closed.length ? (winners.length / closed.length) * 100 : 0;
  const avgProfit = winners.length ? totalRealisedProfit / winners.length : 0;
  const avgLoss = losers.length ? totalLoss / losers.length : 0;

  const maxProfitTrade = winners.reduce((m, t) => (!m || t.pnl > m.pnl ? t : m), null);
  const maxLossTrade = losers.reduce((m, t) => (!m || t.pnl < m.pnl ? t : m), null);

  const rrVals = closed.map(rrRatio).filter((v) => v !== null);
  const avgRR = rrVals.length ? rrVals.reduce((s, v) => s + v, 0) / rrVals.length : 0;

  const { drawdown, drawdownPct } = maxDrawdown(closed);

  document.getElementById("kpiRow1").innerHTML = `
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Total Realised Profit</span><span class="kt-icon">💼</span></div>
      <div class="kt-val pos">${fmtINR(totalRealisedProfit)}</div>
      <div class="kt-sub">${winners.length} winning trades</div>
    </div>
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Total Loss</span><span class="kt-icon">🩸</span></div>
      <div class="kt-val neg">${fmtINR(totalLoss)}</div>
      <div class="kt-sub">${losers.length} losing trades</div>
    </div>
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Net Profit</span><span class="kt-icon">📈</span></div>
      <div class="kt-val ${netProfit >= 0 ? "pos" : "neg"}">${fmtINR(netProfit)}</div>
      <div class="kt-sub">${closed.length} closed trades</div>
    </div>
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Max Profit (single trade)</span><span class="kt-icon">🏆</span></div>
      <div class="kt-val pos">${maxProfitTrade ? fmtINR(maxProfitTrade.pnl) : "—"}</div>
      <div class="kt-sub">${maxProfitTrade ? `(${maxProfitTrade.symbol})` : "No winners yet"}</div>
    </div>
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Max Loss (single trade)</span><span class="kt-icon">⚠️</span></div>
      <div class="kt-val neg">${maxLossTrade ? fmtINR(Math.abs(maxLossTrade.pnl)) : "—"}</div>
      <div class="kt-sub">${maxLossTrade ? `(${maxLossTrade.symbol})` : "No losers yet"}</div>
    </div>
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Max Drawdown</span><span class="kt-icon">📉</span></div>
      <div class="kt-val neg">${fmtINR(drawdown)}</div>
      <div class="kt-sub">${drawdownPct.toFixed(1)}%</div>
    </div>
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Risk Reward Ratio</span><span class="kt-icon">⚖️</span></div>
      <div class="kt-val">1 : ${avgRR ? avgRR.toFixed(1) : "—"}</div>
      <div class="kt-sub">Avg.</div>
    </div>
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Win Rate</span><span class="kt-icon">🎯</span></div>
      <div class="kt-val">${winRate.toFixed(1)}%</div>
      <div class="kt-sub">(${winners.length} / ${closed.length} trades)</div>
    </div>
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Avg. Profit (per trade)</span><span class="kt-icon">📗</span></div>
      <div class="kt-val pos">${fmtINR(avgProfit)}</div>
      <div class="kt-sub">Winning trades</div>
    </div>
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Avg. Loss (per trade)</span><span class="kt-icon">📕</span></div>
      <div class="kt-val neg">${fmtINR(avgLoss)}</div>
      <div class="kt-sub">Losing trades</div>
    </div>`;
}

function maxDrawdown(closed) {
  const sorted = [...closed].sort((a, b) => new Date(a.exitDate) - new Date(b.exitDate));
  let equity = 0, peak = 0, maxDd = 0, maxDdPct = 0;
  sorted.forEach((t) => {
    equity += t.pnl;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDd) {
      maxDd = dd;
      maxDdPct = peak > 0 ? (dd / peak) * 100 : 0;
    }
  });
  return { drawdown: maxDd, drawdownPct: maxDdPct };
}

/* ==================== SYMBOL AGGREGATION ==================== */
function aggregateBySymbol() {
  const closed = closedList();
  const map = {};
  closed.forEach((t) => {
    const key = t.symbol;
    if (!map[key]) map[key] = { symbol: key, trades: [] };
    map[key].trades.push(t);
  });
  return Object.values(map).map((g) => {
    const trades = g.trades;
    const wins = trades.filter((t) => t.pnl > 0).length;
    const losses = trades.filter((t) => t.pnl <= 0).length;
    const netPnl = trades.reduce((s, t) => s + t.pnl, 0);
    const avgPnl = trades.length ? netPnl / trades.length : 0;
    const maxProfit = Math.max(0, ...trades.map((t) => t.pnl));
    const maxLoss = Math.min(0, ...trades.map((t) => t.pnl));
    const winRate = trades.length ? (wins / trades.length) * 100 : 0;
    const rrVals = trades.map(rrRatio).filter((v) => v !== null);
    const avgRR = rrVals.length ? rrVals.reduce((s, v) => s + v, 0) / rrVals.length : null;
    return { symbol: g.symbol, trades, count: trades.length, wins, losses, netPnl, avgPnl, maxProfit, maxLoss, winRate, avgRR };
  });
}

function renderSymbolTable() {
  let rows = aggregateBySymbol();
  if (searchTerm) rows = rows.filter((r) => r.symbol.toLowerCase().includes(searchTerm.toLowerCase()));
  rows.sort((a, b) => b.netPnl - a.netPnl);

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);

  const table = document.getElementById("symbolTable");
  if (!total) {
    table.innerHTML = "";
    table.parentElement.querySelector(".empty-state")?.remove();
    table.parentElement.insertAdjacentHTML("beforeend", '<div class="empty-state">No closed trades match your filters.</div>');
    document.getElementById("pagination").innerHTML = "";
    document.getElementById("resultsCount").textContent = "Showing 0 of 0 symbols";
    return;
  }
  table.parentElement.querySelector(".empty-state")?.remove();

  table.innerHTML = `
    <thead><tr>
      <th>#</th><th>Symbol</th><th>Trades</th><th>Win / Loss</th><th>Net P&amp;L</th><th>Avg. P&amp;L</th>
      <th>Max Profit</th><th>Max Loss</th><th>Win Rate</th><th>R:R Ratio</th><th></th>
    </tr></thead>
    <tbody>${pageRows.map((r, i) => `
      <tr class="row-link" data-symbol="${r.symbol}">
        <td>${start + i + 1}</td>
        <td><div class="sym-cell"><span class="sym-avatar">${symbolIcon(r.symbol)}</span>${r.symbol}</div></td>
        <td>${r.count}</td>
        <td><span class="pos">${r.wins}</span> / <span class="neg">${r.losses}</span></td>
        <td class="pnl ${r.netPnl >= 0 ? "pos" : "neg"}">${fmtINR(r.netPnl)}</td>
        <td class="pnl ${r.avgPnl >= 0 ? "pos" : "neg"}">${fmtINR(r.avgPnl)}</td>
        <td class="pos">${fmtINR(r.maxProfit)}</td>
        <td class="neg">${fmtINR(Math.abs(r.maxLoss))}</td>
        <td>${r.winRate.toFixed(1)}%</td>
        <td class="${r.avgRR !== null && r.avgRR < 1 ? "neg" : ""}">${r.avgRR !== null ? r.avgRR.toFixed(1) + " : 1" : "—"}</td>
        <td class="actions-cell"><button class="chevron-btn">›</button></td>
      </tr>`).join("")}</tbody>`;

  table.querySelectorAll("tr.row-link").forEach((row) => {
    row.addEventListener("click", () => openSymbolModal(row.dataset.symbol));
  });

  document.getElementById("resultsCount").textContent =
    `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, total)} of ${total} symbols`;
  renderPagination(totalPages);
}

function symbolIcon(sym) {
  return (sym || "?").charAt(0).toUpperCase();
}

function renderPagination(totalPages) {
  const el = document.getElementById("pagination");
  if (totalPages <= 1) { el.innerHTML = ""; return; }
  let btns = `<button ${currentPage === 1 ? "disabled" : ""} data-page="prev">‹</button>`;
  for (let p = 1; p <= totalPages; p++) {
    btns += `<button class="${p === currentPage ? "active" : ""}" data-page="${p}">${p}</button>`;
  }
  btns += `<button ${currentPage === totalPages ? "disabled" : ""} data-page="next">›</button>`;
  el.innerHTML = btns;
  el.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => {
      if (b.dataset.page === "prev") currentPage--;
      else if (b.dataset.page === "next") currentPage++;
      else currentPage = parseInt(b.dataset.page, 10);
      renderSymbolTable();
      window.scrollTo({ top: document.getElementById("symbolPanel").offsetTop - 20, behavior: "smooth" });
    });
  });
}

/* ==================== SYMBOL DETAIL MODAL ==================== */
let modalSymbol = null;
let modalSideFilter = "all";

function openSymbolModal(symbol) {
  modalSymbol = symbol;
  modalSideFilter = "all";
  document.querySelectorAll(".modal-side-tab").forEach((b) => b.classList.toggle("active", b.dataset.side === "all"));
  renderSymbolModal();
  document.getElementById("symbolModalOverlay").classList.add("active");
}

function renderSymbolModal() {
  const all = aggregateBySymbol().find((r) => r.symbol === modalSymbol);
  if (!all) return;
  let trades = all.trades;
  if (modalSideFilter !== "all") trades = trades.filter((t) => t.direction === modalSideFilter);
  trades = [...trades].sort((a, b) => new Date(b.exitDate) - new Date(a.exitDate));

  const wins = trades.filter((t) => t.pnl > 0).length;
  const losses = trades.filter((t) => t.pnl <= 0).length;
  const netPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const avgPnl = trades.length ? netPnl / trades.length : 0;
  const maxProfit = Math.max(0, ...trades.map((t) => t.pnl));
  const maxLoss = Math.min(0, ...trades.map((t) => t.pnl));
  const winRate = trades.length ? (wins / trades.length) * 100 : 0;

  document.getElementById("symAvatarBig").textContent = symbolIcon(modalSymbol);
  document.getElementById("symTitle").textContent = modalSymbol;
  document.getElementById("symSubtitle").textContent = symbolName(modalSymbol);

  document.getElementById("symMiniStats").innerHTML = `
    <div class="mini-stat">
      <div class="ms-label">💼 Total Trades</div>
      <div class="ms-val">${trades.length}</div>
    </div>
    <div class="mini-stat">
      <div class="ms-label">⚖️ Win / Loss</div>
      <div class="ms-val"><span class="pos">${wins}</span> / <span class="neg">${losses}</span></div>
      <div class="ms-sub">${winRate.toFixed(1)}% win rate</div>
    </div>
    <div class="mini-stat">
      <div class="ms-label">📗 Net P&amp;L</div>
      <div class="ms-val ${netPnl >= 0 ? "pos" : "neg"}">${fmtINR(netPnl)}</div>
    </div>
    <div class="mini-stat">
      <div class="ms-label">📊 Avg. P&amp;L</div>
      <div class="ms-val ${avgPnl >= 0 ? "pos" : "neg"}">${fmtINR(avgPnl)}</div>
      <div class="ms-sub">per trade</div>
    </div>
    <div class="mini-stat">
      <div class="ms-label">🏆 Max Profit</div>
      <div class="ms-val pos">${fmtINR(maxProfit)}</div>
    </div>
    <div class="mini-stat">
      <div class="ms-label">⚠️ Max Loss</div>
      <div class="ms-val neg">${fmtINR(Math.abs(maxLoss))}</div>
    </div>`;

  const table = document.getElementById("symTradesTable");
  if (!trades.length) {
    table.innerHTML = "";
    table.parentElement.querySelector(".empty-state")?.remove();
    table.parentElement.insertAdjacentHTML("beforeend", '<div class="empty-state">No trades for this filter.</div>');
  } else {
    table.parentElement.querySelector(".empty-state")?.remove();
    table.innerHTML = `
      <thead><tr>
        <th>#</th><th>Date &amp; Time</th><th>Type</th><th>Side</th><th>Entry Price</th><th>Exit Price</th>
        <th>Qty</th><th>P&amp;L</th><th>Return %</th><th>Strategy</th><th>Note</th>
      </tr></thead>
      <tbody>${trades.map((t, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${dayLabel(t.exitDate)}<br><span class="muted" style="font-size:10.5px;">${timeLabel(t.entryDate)}</span></td>
          <td class="muted">${t.assetType || "—"}</td>
          <td><span class="pill ${t.direction === "Long" ? "long" : "short"}">${t.direction}</span></td>
          <td>${fmtNum(t.entryPrice)}</td>
          <td>${fmtNum(t.exitPrice)}</td>
          <td>${t.quantity}</td>
          <td class="pnl ${t.pnl >= 0 ? "pos" : "neg"}">${t.pnl >= 0 ? "+" : ""}${fmtINR(t.pnl)}</td>
          <td class="pnl ${t.pnl >= 0 ? "pos" : "neg"}">${fmtPct(t.pnlPct)}</td>
          <td>${t.strategy || "—"}</td>
          <td class="muted">${t.notes ? t.notes.slice(0, 24) + (t.notes.length > 24 ? "…" : "") : "—"}</td>
        </tr>`).join("")}</tbody>`;
  }
  document.getElementById("symTradesCount").textContent = `Showing 1–${trades.length} of ${trades.length} trades`;
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".pill-tab[data-side]:not(.modal-side-tab)").forEach((btn) => {
    btn.addEventListener("click", () => {
      sideFilter = btn.dataset.side;
      currentPage = 1;
      document.querySelectorAll(".pill-tab[data-side]:not(.modal-side-tab)").forEach((b) => b.classList.toggle("active", b === btn));
      renderAll();
    });
  });

  document.getElementById("searchBox")?.addEventListener("input", (e) => {
    searchTerm = e.target.value;
    currentPage = 1;
    renderSymbolTable();
  });

  document.getElementById("exportCsvBtn")?.addEventListener("click", () => {
    const rows = aggregateBySymbol();
    const headers = ["Symbol", "Trades", "Wins", "Losses", "Net P&L", "Avg P&L", "Max Profit", "Max Loss", "Win Rate %", "Avg R:R"];
    const csvRows = rows.map((r) => [r.symbol, r.count, r.wins, r.losses, r.netPnl.toFixed(2), r.avgPnl.toFixed(2), r.maxProfit.toFixed(2), r.maxLoss.toFixed(2), r.winRate.toFixed(1), r.avgRR !== null ? r.avgRR.toFixed(2) : ""]);
    const csv = [headers, ...csvRows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "realised-profit-by-symbol.csv"; a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("symbolModalClose").addEventListener("click", () => document.getElementById("symbolModalOverlay").classList.remove("active"));
  document.getElementById("symbolModalCloseBtn").addEventListener("click", () => document.getElementById("symbolModalOverlay").classList.remove("active"));

  document.querySelectorAll(".modal-side-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      modalSideFilter = btn.dataset.side;
      document.querySelectorAll(".modal-side-tab").forEach((b) => b.classList.toggle("active", b === btn));
      renderSymbolModal();
    });
  });
});

initAuthGate(init);
