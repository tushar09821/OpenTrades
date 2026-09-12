/**
 * by-symbol.js — Realised Profit analysed by symbol.
 * Reuses the same trade schema / calcTradePnl from utils.js and the same
 * Api from api.js as every other page in the app. Symbol names, sector
 * mapping and avatar colors come from the shared helpers in utils.js.
 */
let TRADES = [];
let profitFilter = "all"; // all | profitable | losing
let searchTerm = "";
let currentPage = 1;
const PAGE_SIZE = 10;

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
  return withCalc(TRADES).filter((t) => t.status === "Closed");
}

function renderAll() {
  renderTopKpis();
  renderSymbolTable();
  renderInsights();
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
    const bestTrade = trades.reduce((m, t) => (!m || t.pnl > m.pnl ? t : m), null);
    const worstTrade = trades.reduce((m, t) => (!m || t.pnl < m.pnl ? t : m), null);
    const winRate = trades.length ? (wins / trades.length) * 100 : 0;
    const avgPnlPct = trades.length ? trades.reduce((s, t) => s + t.pnlPct, 0) / trades.length : 0;
    return { symbol: g.symbol, trades, count: trades.length, wins, losses, netPnl, avgPnl, avgPnlPct, bestTrade, worstTrade, winRate };
  });
}

function filteredSymbolRows() {
  let rows = aggregateBySymbol();
  if (profitFilter === "profitable") rows = rows.filter((r) => r.netPnl > 0);
  else if (profitFilter === "losing") rows = rows.filter((r) => r.netPnl <= 0);
  if (searchTerm) rows = rows.filter((r) => r.symbol.toLowerCase().includes(searchTerm.toLowerCase()));
  return rows;
}

/* ==================== TOP-LEVEL KPI ROW ==================== */
function renderTopKpis() {
  const all = aggregateBySymbol();
  const profitable = all.filter((r) => r.netPnl > 0);
  const losing = all.filter((r) => r.netPnl <= 0);
  const closed = closedList();
  const avgPnl = closed.length ? closed.reduce((s, t) => s + t.pnl, 0) / closed.length : 0;
  const avgPnlPct = closed.length ? closed.reduce((s, t) => s + t.pnlPct, 0) / closed.length : 0;

  document.getElementById("kpiRow1").innerHTML = `
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Total Symbols</span><span class="kt-icon-badge" style="background:var(--blue-soft);color:var(--blue);">🏷️</span></div>
      <div class="kt-val">${all.length}</div>
      <div class="kt-sub">Traded this period</div>
    </div>
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Profitable Symbols</span><span class="kt-icon-badge" style="background:var(--green-soft);color:var(--green);">📈</span></div>
      <div class="kt-val pos">${profitable.length}</div>
      <div class="kt-sub pos">${all.length ? ((profitable.length / all.length) * 100).toFixed(1) : "0.0"}%</div>
    </div>
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Losing Symbols</span><span class="kt-icon-badge" style="background:var(--red-soft);color:var(--red);">📉</span></div>
      <div class="kt-val neg">${losing.length}</div>
      <div class="kt-sub neg">${all.length ? ((losing.length / all.length) * 100).toFixed(1) : "0.0"}%</div>
    </div>
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Avg. P&amp;L (per trade)</span><span class="kt-icon-badge" style="background:var(--purple-soft);color:var(--purple);">📊</span></div>
      <div class="kt-val ${avgPnl >= 0 ? "pos" : "neg"}">${fmtINR(avgPnl)}</div>
      <div class="kt-sub ${avgPnlPct >= 0 ? "pos" : "neg"}">${fmtPct(avgPnlPct)}</div>
    </div>`;
}

/* ==================== SYMBOL TABLE ==================== */
function renderSymbolTable() {
  let rows = filteredSymbolRows();
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
    table.parentElement.insertAdjacentHTML("beforeend", '<div class="empty-state">No symbols match your filters.</div>');
    document.getElementById("resultsCount").textContent = "";
    renderPagination(1);
    return;
  }
  table.parentElement.querySelector(".empty-state")?.remove();

  table.innerHTML = `
    <thead><tr>
      <th>Symbol</th><th>Trades</th><th>Win Rate</th><th>Total P&amp;L</th><th>Avg P&amp;L</th>
      <th>Best Trade</th><th>Worst Trade</th><th></th>
    </tr></thead>
    <tbody>${pageRows.map((r) => `
      <tr class="row-link" data-symbol="${r.symbol}">
        <td>
          <div class="sym-cell">${avatarHtml(r.symbol, 30)}<span>
            <div style="font-weight:700;">${r.symbol}</div>
            <span class="cell-sub">${symbolName(r.symbol)}</span>
          </span></div>
        </td>
        <td>${r.count}</td>
        <td>${r.winRate.toFixed(0)}%</td>
        <td class="pnl ${r.netPnl >= 0 ? "pos" : "neg"}">${r.netPnl >= 0 ? "+" : "-"}${fmtINR(Math.abs(r.netPnl))}</td>
        <td class="pnl ${r.avgPnl >= 0 ? "pos" : "neg"}">${r.avgPnl >= 0 ? "+" : "-"}${fmtINR(Math.abs(r.avgPnl))}</td>
        <td class="pos">${r.bestTrade && r.bestTrade.pnl > 0 ? "+" + fmtINR(r.bestTrade.pnl) : "—"}</td>
        <td class="neg">${r.worstTrade && r.worstTrade.pnl < 0 ? fmtINR(r.worstTrade.pnl) : "—"}</td>
        <td class="actions-cell"><button class="chevron-btn">›</button></td>
      </tr>`).join("")}</tbody>`;

  table.querySelectorAll("tr.row-link").forEach((row) => {
    row.addEventListener("click", () => openSymbolModal(row.dataset.symbol));
  });

  document.getElementById("resultsCount").textContent =
    `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, total)} of ${total} symbols`;
  renderPagination(totalPages);
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

/* ==================== PERFORMANCE INSIGHTS ==================== */
function renderInsights() {
  const rows = aggregateBySymbol();
  const best = rows.length ? rows.reduce((m, r) => (r.netPnl > m.netPnl ? r : m)) : null;
  const mostTraded = rows.length ? rows.reduce((m, r) => (r.count > m.count ? r : m)) : null;
  // "Most volatile" ≈ largest single-trade swing (best or worst) relative to its own average.
  const mostVolatile = rows.length
    ? rows.reduce((m, r) => {
        const swing = Math.max(Math.abs(r.bestTrade?.pnlPct || 0), Math.abs(r.worstTrade?.pnlPct || 0));
        const mSwing = m ? Math.max(Math.abs(m.bestTrade?.pnlPct || 0), Math.abs(m.worstTrade?.pnlPct || 0)) : -Infinity;
        return swing > mSwing ? r : m;
      }, null)
    : null;
  const volatileTrade = mostVolatile
    ? (Math.abs(mostVolatile.worstTrade?.pnlPct || 0) > Math.abs(mostVolatile.bestTrade?.pnlPct || 0) ? mostVolatile.worstTrade : mostVolatile.bestTrade)
    : null;

  document.getElementById("insightGrid").innerHTML = `
    <div class="insight-tile">
      <span class="ins-ico" style="background:var(--yellow-soft);color:var(--yellow);">🏆</span>
      <span>
        <div class="ins-label">Best Performing Symbol</div>
        <div class="ins-val">${best ? best.symbol : "—"}</div>
        <div class="ins-sub pos">${best ? `${fmtINR(best.netPnl)} (${best.winRate.toFixed(0)}%)` : "—"}</div>
      </span>
    </div>
    <div class="insight-tile">
      <span class="ins-ico" style="background:var(--red-soft);color:var(--red);">📊</span>
      <span>
        <div class="ins-label">Most Volatile</div>
        <div class="ins-val">${mostVolatile ? mostVolatile.symbol : "—"}</div>
        <div class="ins-sub ${volatileTrade && volatileTrade.pnl >= 0 ? "pos" : "neg"}">${volatileTrade ? `${fmtPct(volatileTrade.pnlPct)} (worst trade)` : "—"}</div>
      </span>
    </div>
    <div class="insight-tile">
      <span class="ins-ico" style="background:var(--blue-soft);color:var(--blue);">🕒</span>
      <span>
        <div class="ins-label">Most Traded</div>
        <div class="ins-val">${mostTraded ? mostTraded.symbol : "—"}</div>
        <div class="ins-sub muted">${mostTraded ? `${mostTraded.count} trade${mostTraded.count === 1 ? "" : "s"}` : "—"}</div>
      </span>
    </div>
    <div class="insight-tile">
      <span class="ins-ico" style="background:var(--accent-soft);color:var(--accent);">💡</span>
      <span>
        <div class="ins-label">Key Takeaway</div>
        <div class="ins-sub muted" style="margin-top:5px;">Focus on sectors with strong momentum and avoid high volatility stocks.</div>
      </span>
    </div>`;
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

  const av = avatarStyle(modalSymbol);
  const avatarBig = document.getElementById("symAvatarBig");
  avatarBig.textContent = (modalSymbol || "?").charAt(0).toUpperCase();
  avatarBig.style.background = av.bg;
  avatarBig.style.color = av.fg;
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
  document.getElementById("profitFilterToggle")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-filter]");
    if (!btn) return;
    profitFilter = btn.dataset.filter;
    currentPage = 1;
    document.querySelectorAll("#profitFilterToggle button").forEach((b) => b.classList.toggle("active", b === btn));
    renderSymbolTable();
  });

  document.getElementById("searchBox")?.addEventListener("input", (e) => {
    searchTerm = e.target.value;
    currentPage = 1;
    renderSymbolTable();
  });

  document.getElementById("exportCsvBtn")?.addEventListener("click", () => {
    const rows = aggregateBySymbol();
    const headers = ["Symbol", "Trades", "Wins", "Losses", "Net P&L", "Avg P&L", "Win Rate %"];
    const csvRows = rows.map((r) => [r.symbol, r.count, r.wins, r.losses, r.netPnl.toFixed(2), r.avgPnl.toFixed(2), r.winRate.toFixed(1)]);
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