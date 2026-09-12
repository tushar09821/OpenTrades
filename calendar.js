/**
 * calendar.js — Monthly calendar view of realised P&L
 */
let TRADES = [];
let viewYear, viewMonth; // viewMonth: 0-11
let msumChartInstance = null;
let showProfitBars = true;
let showLossBars = true;

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
  renderMonthlySummary();
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

function renderMonthlySummary() {
  const byDay = tradesByDay();
  const monthTrades = closedList().filter((t) => {
    const d = new Date(t.exitDate);
    return d.getFullYear() === viewYear && d.getMonth() === viewMonth;
  });
  const totalPnl = monthTrades.reduce((s, t) => s + t.pnl, 0);
  const invested = monthTrades.reduce((s, t) => s + (parseFloat(t.investedAmount) || t.entryPrice * t.quantity), 0);
  const totalPct = invested ? (totalPnl / invested) * 100 : 0;

  const dayKeysInMonth = Object.keys(byDay).filter((k) => {
    const d = new Date(k);
    return d.getFullYear() === viewYear && d.getMonth() === viewMonth;
  }).sort();

  const winningDays = dayKeysInMonth.filter((k) => byDay[k].reduce((s, t) => s + t.pnl, 0) >= 0).length;
  const losingDays = dayKeysInMonth.length - winningDays;
  const totalTradingDays = dayKeysInMonth.length;

  document.getElementById("msumMonth").textContent =
    new Date(viewYear, viewMonth, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }) + " · " + monthTrades.length + " closed";
  document.getElementById("msumTotal").innerHTML = `<span class="${totalPnl >= 0 ? "pos" : "neg"}">${totalPnl >= 0 ? "+" : ""}${fmtINR(totalPnl)}</span>`;
  document.getElementById("msumSub").innerHTML = `<span class="${totalPct >= 0 ? "pos" : "neg"}">${fmtPct(totalPct)}</span>`;
  document.getElementById("msumWinDays").textContent = `${winningDays} / ${totalTradingDays}`;
  document.getElementById("msumLossDays").textContent = `${losingDays} / ${totalTradingDays}`;
  document.getElementById("msumWinPct").textContent = totalTradingDays ? `${((winningDays / totalTradingDays) * 100).toFixed(1)}%` : "—";
  document.getElementById("msumLossPct").textContent = totalTradingDays ? `${((losingDays / totalTradingDays) * 100).toFixed(1)}%` : "—";

  renderMsumChart(dayKeysInMonth, byDay);
}

function renderMsumChart(dayKeysInMonth, byDay) {
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const labels = [];
  const values = [];
  const colors = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const key = new Date(viewYear, viewMonth, d).toISOString().slice(0, 10);
    const dayPnl = (byDay[key] || []).reduce((s, t) => s + t.pnl, 0);
    labels.push(String(d));
    const isProfit = dayPnl >= 0;
    if ((isProfit && !showProfitBars) || (!isProfit && dayPnl !== 0 && !showLossBars)) {
      values.push(0);
    } else {
      values.push(dayPnl);
    }
    colors.push(isProfit ? "#22c55e" : "#f43f5e");
  }

  const ctx = document.getElementById("msumChart").getContext("2d");
  if (msumChartInstance) msumChartInstance.destroy();
  msumChartInstance = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderRadius: 3, maxBarThickness: 14 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#8998a9", font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
        y: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#8998a9", font: { size: 9 }, callback: (v) => fmtNum(v) } },
      },
    },
  });
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

  document.getElementById("legendProfit")?.addEventListener("click", (e) => {
    showProfitBars = !showProfitBars;
    e.currentTarget.classList.toggle("on", showProfitBars);
    render();
  });
  document.getElementById("legendLoss")?.addEventListener("click", (e) => {
    showLossBars = !showLossBars;
    e.currentTarget.classList.toggle("on", showLossBars);
    render();
  });
});

initAuthGate(init);