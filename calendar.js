/**
 * calendar.js — Monthly calendar view of realised P&L
 */
let TRADES = [];
let viewYear, viewMonth; // viewMonth: 0-11

async function init() {
  const now = new Date();
  viewYear = now.getFullYear();
  viewMonth = now.getMonth();
  try {
    TRADES = await Api.listTrades();
  } catch (e) {
    toast("Could not reach API, showing cached data", true);
    TRADES = Api._localList();
  }
  render();
}

function closedList() {
  return withCalc(TRADES).filter((t) => t.status === "Closed" && t.exitDate);
}

function dayKey(dateStr) {
  return new Date(dateStr).toISOString().slice(0, 10);
}

function tradesByDay() {
  const map = {};
  closedList().forEach((t) => {
    const key = dayKey(t.exitDate);
    (map[key] = map[key] || []).push(t);
  });
  return map;
}

function render() {
  renderHeader();
  renderGrid();
  renderSummary();
}

function renderHeader() {
  const label = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  document.getElementById("calMonthLabel").textContent = label;
}

function renderGrid() {
  const grid = document.getElementById("calGrid");
  const byDay = tradesByDay();
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startOffset = firstOfMonth.getDay(); // 0 = Sunday
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const todayKey = new Date().toISOString().slice(0, 10);

  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let html = dow.map((d) => `<div class="cal-dow">${d}</div>`).join("");

  for (let i = 0; i < startOffset; i++) {
    html += `<div class="cal-cell empty"></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(viewYear, viewMonth, d);
    const key = dateObj.toISOString().slice(0, 10);
    const dayTrades = byDay[key] || [];
    const pnl = dayTrades.reduce((s, t) => s + t.pnl, 0);
    const isToday = key === todayKey;
    let cellClass = "cal-cell";
    if (isToday) cellClass += " today";
    if (dayTrades.length) {
      cellClass += pnl >= 0 ? " pos-day has-trades" : " neg-day has-trades";
    }
    html += `
      <div class="${cellClass}" data-date="${key}">
        <div class="cal-daynum">${d}</div>
        ${dayTrades.length ? `
          <div>
            <div class="cal-pnl ${pnl >= 0 ? "pos" : "neg"}">${pnl >= 0 ? "+" : ""}${fmtINR(pnl)}</div>
            <div class="cal-count">${dayTrades.length} trade${dayTrades.length === 1 ? "" : "s"}</div>
          </div>` : ""}
      </div>`;
  }

  grid.innerHTML = html;

  grid.querySelectorAll(".cal-cell.has-trades").forEach((cell) => {
    cell.addEventListener("click", () => openDayModal(cell.dataset.date, byDay[cell.dataset.date]));
  });
}

function renderSummary() {
  const byDay = tradesByDay();
  const monthTrades = closedList().filter((t) => {
    const d = new Date(t.exitDate);
    return d.getFullYear() === viewYear && d.getMonth() === viewMonth;
  });
  const totalPnl = monthTrades.reduce((s, t) => s + t.pnl, 0);
  const wins = monthTrades.filter((t) => t.pnl > 0).length;
  const losses = monthTrades.filter((t) => t.pnl <= 0).length;
  const winRate = monthTrades.length ? (wins / monthTrades.length) * 100 : 0;
  const greenDays = Object.keys(byDay).filter((k) => {
    const d = new Date(k);
    return d.getFullYear() === viewYear && d.getMonth() === viewMonth && byDay[k].reduce((s, t) => s + t.pnl, 0) >= 0;
  }).length;
  const redDays = Object.keys(byDay).filter((k) => {
    const d = new Date(k);
    return d.getFullYear() === viewYear && d.getMonth() === viewMonth && byDay[k].reduce((s, t) => s + t.pnl, 0) < 0;
  }).length;

  document.getElementById("calSummary").innerHTML = `
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Month P&amp;L</span><span class="kt-icon">📗</span></div>
      <div class="kt-val ${totalPnl >= 0 ? "pos" : "neg"}">${totalPnl >= 0 ? "+" : ""}${fmtINR(totalPnl)}</div>
      <div class="kt-sub">${monthTrades.length} closed trades</div>
    </div>
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Win Rate</span><span class="kt-icon">🎯</span></div>
      <div class="kt-val">${winRate.toFixed(1)}%</div>
      <div class="kt-sub">${wins}W / ${losses}L</div>
    </div>
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Green Days</span><span class="kt-icon">🟢</span></div>
      <div class="kt-val pos">${greenDays}</div>
      <div class="kt-sub">Profitable trading days</div>
    </div>
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Red Days</span><span class="kt-icon">🔴</span></div>
      <div class="kt-val neg">${redDays}</div>
      <div class="kt-sub">Loss-making trading days</div>
    </div>`;
}

function openDayModal(dateKey, trades) {
  const label = new Date(dateKey).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  document.getElementById("dayModalTitle").textContent = label;
  const pnl = trades.reduce((s, t) => s + t.pnl, 0);
  document.getElementById("dayModalSub").innerHTML = `<span class="${pnl >= 0 ? "pos" : "neg"}">${pnl >= 0 ? "+" : ""}${fmtINR(pnl)}</span> across ${trades.length} trade${trades.length === 1 ? "" : "s"}`;
  const table = document.getElementById("dayModalTable");
  table.innerHTML = `
    <thead><tr><th>Symbol</th><th>Type</th><th>Entry</th><th>Exit</th><th>Qty</th><th>P&amp;L</th><th>Return %</th></tr></thead>
    <tbody>${trades.map((t) => `
      <tr>
        <td>${t.symbol}</td>
        <td><span class="pill ${t.direction === "Long" ? "long" : "short"}">${t.direction === "Long" ? "BUY" : "SELL"}</span></td>
        <td>${fmtNum(t.entryPrice)}</td>
        <td>${fmtNum(t.exitPrice)}</td>
        <td>${t.quantity}</td>
        <td class="pnl ${t.pnl >= 0 ? "pos" : "neg"}">${t.pnl >= 0 ? "+" : ""}${fmtINR(t.pnl)}</td>
        <td class="pnl ${t.pnl >= 0 ? "pos" : "neg"}">${fmtPct(t.pnlPct)}</td>
      </tr>`).join("")}</tbody>`;
  document.getElementById("dayModalOverlay").classList.add("active");
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("calPrev").addEventListener("click", () => {
    viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    render();
  });
  document.getElementById("calNext").addEventListener("click", () => {
    viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    render();
  });
  document.getElementById("calToday").addEventListener("click", () => {
    const now = new Date();
    viewYear = now.getFullYear(); viewMonth = now.getMonth();
    render();
  });
  document.getElementById("dayModalClose").addEventListener("click", () => document.getElementById("dayModalOverlay").classList.remove("active"));
});

initAuthGate(init);
