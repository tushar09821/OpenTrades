/**
 * open-trades.js — Open Trades Manager page
 */
let TRADES = [];
let MARKET_PRICES = [];   // symbols + current prices from the /dashboard-data feed
let searchTerm = "";
let filterDirection = "";
let filterAssetType = "";
let editingId = null;

function openTradesList() { return withCalc(TRADES).filter((t) => t.status === "Open"); }
function closedTradesList() { return withCalc(TRADES).filter((t) => t.status === "Closed"); }

function visibleOpenTrades() {
  return openTradesList().filter((t) => {
    if (searchTerm && !t.symbol.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (filterDirection && t.direction !== filterDirection) return false;
    if (filterAssetType && t.assetType !== filterAssetType) return false;
    return true;
  });
}

async function init() {
  await loadTrades();
  document.getElementById("syncNote").innerHTML = `<span class="dot-live"></span> Last Updated: ${new Date().toLocaleString("en-IN", { hour12: true })}`;
  // Pull the exact tradable symbols (and their current prices) from the same
  // /dashboard-data feed used for LTP sync, so the Symbol field/datalist offers
  // real, correctly-spelled symbols instead of only whatever's been typed before.
  try { MARKET_PRICES = await Api.getMarketPrices(); } catch { MARKET_PRICES = []; }
  populateDatalists();
  // Best-effort, non-blocking: refresh LTP for open trades from your existing price feed.
  syncLtpFromMarket(TRADES).then((count) => {
    if (count > 0) {
      toast(`Synced live prices for ${count} open trade${count === 1 ? "" : "s"}`);
      renderAll();
    }
  }).catch(() => { /* silent — sync is a convenience, not a hard requirement */ });
}

async function loadTrades() {
  try {
    TRADES = await Api.listTrades();
  } catch (e) {
    toast("Could not reach API, showing cached data", true);
    TRADES = Api._localList();
  }
  renderAll();
}

document.getElementById("syncPricesBtn").addEventListener("click", async () => {
  const btn = document.getElementById("syncPricesBtn");
  btn.disabled = true;
  btn.textContent = "🔄 Syncing…";
  try {
    const count = await syncLtpFromMarket(TRADES);
    toast(count > 0 ? `Synced live prices for ${count} open trade${count === 1 ? "" : "s"}` : "Prices already up to date");
    renderAll();
  } catch (e) {
    toast(e.message || "Price sync failed", true);
  } finally {
    btn.disabled = false;
    btn.textContent = "🔄 Sync Prices";
  }
});

function renderAll() {
  renderKpiRow();
  renderOpenTradesTable();
  renderSummaryStrip();
  renderActionsLog();
  populateDatalists();
}

/* ==================== KPI ROW ==================== */
function renderKpiRow() {
  const open = openTradesList();
  const totalInvested = open.reduce((s, t) => s + (parseFloat(t.investedAmount) || t.entryPrice * t.quantity), 0);
  const unrealised = open.reduce((s, t) => s + t.pnl, 0);
  const unrealisedPct = totalInvested ? (unrealised / totalInvested) * 100 : 0;
  const currentValue = totalInvested + unrealised;

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayClosed = closedTradesList().filter((t) => t.exitDate === todayStr);
  const todayPnl = todayClosed.reduce((s, t) => s + t.pnl, 0) + unrealised; // realized today + current open unrealized
  const todayPct = totalInvested ? (todayPnl / totalInvested) * 100 : 0;

  document.getElementById("kpiRow").innerHTML = `
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Total Open Trades</span><span class="kt-icon-badge" style="background:var(--yellow-soft);color:var(--yellow);">👜</span></div>
      <div class="kt-val">${open.length}</div>
      <div class="kt-sub">All positions</div>
    </div>
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Total Invested</span><span class="kt-icon-badge" style="background:var(--accent-soft);color:var(--accent);">👛</span></div>
      <div class="kt-val">${fmtINR(totalInvested)}</div>
      <div class="kt-sub">Margin/Capital in use</div>
    </div>
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Unrealised P&amp;L</span><span class="kt-icon-badge" style="background:var(--green-soft);color:var(--green);">📈</span></div>
      <div class="kt-val ${unrealised >= 0 ? "pos" : "neg"}">${unrealised >= 0 ? "+" : ""}${fmtINR(unrealised)}</div>
      <div class="kt-sub ${unrealisedPct >= 0 ? "pos" : "neg"}">${fmtPct(unrealisedPct)}</div>
    </div>
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Current Value</span><span class="kt-icon-badge" style="background:var(--purple-soft);color:var(--purple);">🥧</span></div>
      <div class="kt-val">${fmtINR(currentValue)}</div>
      <div class="kt-sub">Invested + Unrealised P&amp;L</div>
    </div>
    <div class="kpi-tile">
      <div class="kt-top"><span class="kt-label">Today's P&amp;L</span><span class="kt-icon-badge" style="background:var(--blue-soft);color:var(--blue);">📊</span></div>
      <div class="kt-val ${todayPnl >= 0 ? "pos" : "neg"}">${todayPnl >= 0 ? "+" : ""}${fmtINR(todayPnl)}</div>
      <div class="kt-sub ${todayPct >= 0 ? "pos" : "neg"}">${fmtPct(todayPct)}</div>
    </div>`;
}

/* ==================== OPEN TRADES SUMMARY STRIP ==================== */
function renderSummaryStrip() {
  const open = openTradesList();
  const totalPnl = open.reduce((s, t) => s + t.pnl, 0);
  const totalPnlPct = open.length ? open.reduce((s, t) => s + t.pnlPct, 0) / open.length : 0;
  const profitable = open.filter((t) => t.pnl > 0);
  const losing = open.filter((t) => t.pnl <= 0);
  const largestProfit = profitable.reduce((m, t) => (!m || t.pnl > m.pnl ? t : m), null);
  const largestLoss = losing.reduce((m, t) => (!m || t.pnl < m.pnl ? t : m), null);

  document.getElementById("summaryStrip").innerHTML = `
    <div class="st-tile">
      <div class="st-label">Total P&amp;L</div>
      <div class="st-val ${totalPnl >= 0 ? "pos" : "neg"}">${totalPnl >= 0 ? "+" : ""}${fmtINR(totalPnl)}</div>
      <div class="st-sub ${totalPnlPct >= 0 ? "pos" : "neg"}">${fmtPct(totalPnlPct)}</div>
    </div>
    <div class="st-tile">
      <div class="st-label">Profitable Trades</div>
      <div class="st-val pos">${profitable.length} / ${open.length}</div>
      <div class="st-sub">${open.length ? ((profitable.length / open.length) * 100).toFixed(0) : 0}%</div>
    </div>
    <div class="st-tile">
      <div class="st-label">Losing Trades</div>
      <div class="st-val neg">${losing.length} / ${open.length}</div>
      <div class="st-sub">${open.length ? ((losing.length / open.length) * 100).toFixed(0) : 0}%</div>
    </div>
    <div class="st-tile">
      <div class="st-label">Largest Profit</div>
      <div class="st-val pos">${largestProfit ? fmtINR(largestProfit.pnl) : "—"}</div>
      <div class="st-sub">${largestProfit ? `(${largestProfit.symbol})` : "No winners yet"}</div>
    </div>
    <div class="st-tile">
      <div class="st-label">Largest Loss</div>
      <div class="st-val neg">${largestLoss ? fmtINR(largestLoss.pnl) : "—"}</div>
      <div class="st-sub">${largestLoss ? `(${largestLoss.symbol})` : "No losers yet"}</div>
    </div>`;
}

/* ==================== OPEN TRADES TABLE ==================== */
function renderOpenTradesTable() {
  const arr = visibleOpenTrades();
  document.getElementById("openTradesHeading").textContent = `Open Trades (${arr.length})`;
  const table = document.getElementById("openTradesTable");

  if (!arr.length) {
    table.innerHTML = "";
    table.parentElement.insertAdjacentHTML("beforeend", "");
    table.parentElement.querySelector(".empty-state")?.remove();
    table.parentElement.insertAdjacentHTML("beforeend", '<div class="empty-state">No open trades match your filters.</div>');
    document.getElementById("openTotalsRow").innerHTML = "";
    return;
  }
  table.parentElement.querySelector(".empty-state")?.remove();

  table.innerHTML = `
    <thead><tr>
      <th>Symbol</th><th>Type</th><th>Qty</th><th>Entry Price</th><th>LTP</th><th>P&amp;L %</th><th>P&amp;L ₹</th>
      <th>Invested</th><th>Current Value</th><th>Stop Loss</th><th>R:R</th><th>Actions</th>
    </tr></thead>
    <tbody>${arr.map((t) => {
      const rr = rrRatio(t);
      const invested = parseFloat(t.investedAmount) || t.entryPrice * t.quantity;
      return `<tr data-id="${t.id}">
        <td>
          <div class="sym-cell">${avatarHtml(t.symbol, 30)}<span>
            <div style="font-weight:700;">${t.symbol}</div>
            <span class="cell-sub">${symbolName(t.symbol)}</span>
          </span></div>
        </td>
        <td><span class="pill ${t.direction === "Long" ? "buy" : "sell"}">${t.direction === "Long" ? "BUY" : "SELL"}</span></td>
        <td>${t.quantity}</td>
        <td>${fmtNum(t.entryPrice)}</td>
        <td><span class="ltp-cell" data-id="${t.id}" style="cursor:pointer;border-bottom:1px dashed var(--border);" title="Click to update LTP">${fmtNum(t.ltp || t.entryPrice)}</span></td>
        <td class="pnl ${t.pnl >= 0 ? "pos" : "neg"}">${fmtPct(t.pnlPct)}</td>
        <td class="pnl ${t.pnl >= 0 ? "pos" : "neg"}">${t.pnl >= 0 ? "+" : "-"}${fmtINR(Math.abs(t.pnl))}</td>
        <td>${fmtINR(invested)}</td>
        <td>${fmtINR(invested + t.pnl)}</td>
        <td>${t.stopLoss ? fmtNum(t.stopLoss) : "—"}</td>
        <td>${rr ? "1:" + rr.toFixed(1) : "—"}</td>
        <td class="actions-cell">
          <button class="actions-btn" data-id="${t.id}">⋮</button>
        </td>
      </tr>`;
    }).join("")}</tbody>`;

  const totalInvested = arr.reduce((s, t) => s + (parseFloat(t.investedAmount) || t.entryPrice * t.quantity), 0);
  const unrealised = arr.reduce((s, t) => s + t.pnl, 0);
  const currentValue = totalInvested + unrealised;
  document.getElementById("openTotalsRow").innerHTML = `
    <span><span class="muted">Total Invested</span> <b>${fmtINR(totalInvested)}</b></span>
    <span><span class="muted">Unrealised P&amp;L</span> <b class="${unrealised >= 0 ? "pos" : "neg"}" style="color:${unrealised >= 0 ? "var(--green)" : "var(--red)"};">${fmtINR(unrealised)}</b></span>
    <span><span class="muted">Current Value</span> <b>${fmtINR(currentValue)}</b></span>`;

  // Inline LTP editing
  table.querySelectorAll(".ltp-cell").forEach((cell) => {
    cell.addEventListener("click", () => {
      const id = cell.dataset.id;
      const trade = TRADES.find((t) => t.id === id);
      const input = document.createElement("input");
      input.type = "number";
      input.step = "0.01";
      input.value = trade.ltp || trade.entryPrice;
      input.style.cssText = "width:80px;background:var(--panel-2);border:1px solid var(--accent);color:var(--text);border-radius:6px;padding:3px 6px;";
      cell.replaceWith(input);
      input.focus();
      input.select();
      const commit = async () => {
        const val = parseFloat(input.value);
        if (isFinite(val) && val > 0) {
          try {
            await Api.updateTrade(id, { ltp: val });
            const idx = TRADES.findIndex((t) => t.id === id);
            TRADES[idx] = { ...TRADES[idx], ltp: val };
            toast(`LTP updated for ${trade.symbol}`);
          } catch (e) { toast(e.message, true); }
        }
        renderAll();
      };
      input.addEventListener("blur", commit);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") input.blur(); });
    });
  });

  // Actions menu — appended to <body> (not inside the scrollable table) so it
  // floats freely instead of getting clipped/scrolled inside the table container.
  table.querySelectorAll(".actions-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelectorAll(".actions-menu").forEach((m) => m.remove());
      const id = btn.dataset.id;
      const menu = document.createElement("div");
      menu.className = "actions-menu";
      menu.innerHTML = `
        <button data-act="edit">✎ Edit</button>
        <button data-act="squareoff">⏹ Square-off</button>
        <button data-act="delete" class="danger">🗑 Delete</button>`;
      document.body.appendChild(menu);

      const rect = btn.getBoundingClientRect();
      const menuW = 150, menuH = menu.offsetHeight || 116;
      let left = Math.min(rect.right - menuW, window.innerWidth - menuW - 8);
      left = Math.max(8, left);
      let top = rect.bottom + 6;
      if (top + menuH > window.innerHeight - 8) top = rect.top - menuH - 6; // flip above if no room below
      menu.style.left = left + "px";
      menu.style.top = top + "px";

      menu.querySelector('[data-act="edit"]').addEventListener("click", () => { menu.remove(); openEditModal(id); });
      menu.querySelector('[data-act="squareoff"]').addEventListener("click", () => { menu.remove(); squareOffTrade(id); });
      menu.querySelector('[data-act="delete"]').addEventListener("click", () => { menu.remove(); deleteTrade(id); });
    });
  });
}
document.addEventListener("click", (e) => {
  if (!e.target.closest(".actions-menu") && !e.target.closest(".actions-btn")) {
    document.querySelectorAll(".actions-menu").forEach((m) => m.remove());
  }
});
window.addEventListener("scroll", () => document.querySelectorAll(".actions-menu").forEach((m) => m.remove()), true);

let closingId = null;

function localDateNow() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function squareOffTrade(id) {
  const trade = withCalc(TRADES).find((t) => t.id === id);
  if (!trade) return;
  closingId = id;
  document.getElementById("closeSymbol").textContent = trade.symbol;
  document.getElementById("closeAssetType").textContent = trade.assetType || "";
  document.getElementById("closeAvatar").textContent = trade.symbol.charAt(0).toUpperCase();
  document.getElementById("closeCurrentPrice").textContent = fmtNum(trade.ltp || trade.entryPrice);
  document.getElementById("closeCurrentPct").textContent = fmtPct(trade.pnlPct);
  document.getElementById("closeCurrentPct").className = trade.pnlPct >= 0 ? "pos" : "neg";
  document.getElementById("closeSellDate").value = localDateNow();
  document.getElementById("closeExitPrice").value = trade.ltp || trade.entryPrice;
  document.getElementById("closeExitValue").value = Math.round((trade.ltp || trade.entryPrice) * trade.quantity);
  document.getElementById("closeNotes").value = "";
  document.getElementById("closeError").textContent = "";
  document.getElementById("closeModalOverlay").classList.add("active");
  updateCloseExitValue();
}

function updateCloseExitValue() {
  const trade = TRADES.find((t) => t.id === closingId);
  if (!trade) return;
  const exitPrice = parseFloat(document.getElementById("closeExitPrice").value);
  if (isFinite(exitPrice)) {
    document.getElementById("closeExitValue").value = Math.round(exitPrice * trade.quantity);
  }
}
document.getElementById("closeExitPrice")?.addEventListener("input", updateCloseExitValue);
document.getElementById("closeCancel")?.addEventListener("click", () => document.getElementById("closeModalOverlay").classList.remove("active"));
document.getElementById("closeModalClose")?.addEventListener("click", () => document.getElementById("closeModalOverlay").classList.remove("active"));

document.getElementById("closeConfirm")?.addEventListener("click", async () => {
  const trade = TRADES.find((t) => t.id === closingId);
  if (!trade) return;
  const errBox = document.getElementById("closeError");
  const exitPrice = parseFloat(document.getElementById("closeExitPrice").value);
  const sellDate = document.getElementById("closeSellDate").value;
  if (!isFinite(exitPrice) || exitPrice <= 0) { errBox.textContent = "Enter a valid exit price."; return; }
  if (!sellDate) { errBox.textContent = "Sell date is required."; return; }
  const notes = document.getElementById("closeNotes").value.trim();
  try {
    const updates = {
      status: "Closed",
      exitDate: new Date(sellDate).toISOString(),
      exitPrice,
      notes: notes ? (trade.notes ? trade.notes + " | " + notes : notes) : trade.notes,
    };
    await Api.updateTrade(closingId, updates);
    const idx = TRADES.findIndex((t) => t.id === closingId);
    TRADES[idx] = { ...TRADES[idx], ...updates };
    document.getElementById("closeModalOverlay").classList.remove("active");
    toast(`${trade.symbol} squared off`);
    renderAll();
  } catch (e) {
    errBox.textContent = e.message;
  }
});

async function deleteTrade(id) {
  const trade = TRADES.find((t) => t.id === id);
  if (!confirm(`Delete ${trade?.symbol || "this trade"}? This cannot be undone.`)) return;
  try {
    await Api.deleteTrade(id);
    TRADES = TRADES.filter((t) => t.id !== id);
    toast("Trade deleted");
    renderAll();
  } catch (e) { toast(e.message, true); }
}

/* ==================== EDIT MODAL ==================== */
function openEditModal(id) {
  const trade = TRADES.find((t) => t.id === id);
  if (!trade) return;
  editingId = id;
  document.getElementById("eEntryPrice").value = trade.entryPrice;
  document.getElementById("eQuantity").value = trade.quantity;
  document.getElementById("eTarget").value = trade.targetPrice || "";
  document.getElementById("eStopLoss").value = trade.stopLoss || "";
  document.getElementById("eLtp").value = trade.ltp || trade.entryPrice;
  document.getElementById("eNotes").value = trade.notes || "";
  document.getElementById("editError").textContent = "";
  document.getElementById("editModalOverlay").classList.add("active");
}
document.getElementById("editCancel").addEventListener("click", () => document.getElementById("editModalOverlay").classList.remove("active"));
document.getElementById("editModalClose")?.addEventListener("click", () => document.getElementById("editModalOverlay").classList.remove("active"));
document.getElementById("editSave").addEventListener("click", async () => {
  const entryPrice = parseFloat(document.getElementById("eEntryPrice").value);
  const quantity = parseFloat(document.getElementById("eQuantity").value);
  if (!isFinite(entryPrice) || !isFinite(quantity) || quantity <= 0) {
    document.getElementById("editError").textContent = "Entry price and quantity must be valid numbers.";
    return;
  }
  const updates = {
    entryPrice,
    quantity,
    targetPrice: parseFloat(document.getElementById("eTarget").value) || null,
    stopLoss: parseFloat(document.getElementById("eStopLoss").value) || null,
    ltp: parseFloat(document.getElementById("eLtp").value) || entryPrice,
    notes: document.getElementById("eNotes").value.trim(),
  };
  try {
    await Api.updateTrade(editingId, updates);
    const idx = TRADES.findIndex((t) => t.id === editingId);
    TRADES[idx] = { ...TRADES[idx], ...updates };
    document.getElementById("editModalOverlay").classList.remove("active");
    toast("Trade updated");
    renderAll();
  } catch (e) {
    document.getElementById("editError").textContent = e.message;
  }
});

/* ==================== RECENT ACTIONS LOG ==================== */
function renderActionsLog() {
  const log = [];
  TRADES.forEach((t) => {
    log.push({ time: t.entryDate, action: "BUY", symbol: t.symbol, assetType: t.assetType, details: `${t.quantity} @ ${fmtNum(t.entryPrice)}`, status: t.status });
    if (t.status === "Closed" && t.exitDate) {
      log.push({ time: t.exitDate, action: "SQUARE-OFF", symbol: t.symbol, assetType: t.assetType, details: `${t.quantity} @ ${fmtNum(t.exitPrice)}`, status: "Closed" });
    }
  });
  log.sort((a, b) => new Date(b.time) - new Date(a.time));
  const top = log.slice(0, 12);
  const table = document.getElementById("actionsLogTable");
  if (!top.length) { table.innerHTML = ""; table.parentElement.insertAdjacentHTML("beforeend", '<div class="empty-state">No activity yet.</div>'); return; }
  table.parentElement.querySelector(".empty-state")?.remove();
  table.innerHTML = `<thead><tr><th>Time</th><th>Action</th><th>Stock / Type</th><th>Details</th><th>Status</th></tr></thead>
    <tbody>${top.map((l) => `<tr>
      <td>${timeLabel(l.time)} · ${new Date(l.time).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td>
      <td><span class="pill ${l.action === "BUY" ? "long" : "short"}">${l.action}</span></td>
      <td>${l.symbol} <span class="muted" style="font-size:10.5px;">${l.assetType || ""}</span></td>
      <td>${l.details}</td>
      <td><span class="pill ${l.status === "Open" ? "open" : "closed"}">${l.status}</span></td>
    </tr>`).join("")}</tbody>`;
}

/* ==================== ADD NEW TRADE FORM ==================== */
let selectedAssetType = "Cash/Future";
let selectedDirection = "Long";

document.getElementById("assetTypeToggle").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-val]");
  if (!btn) return;
  selectedAssetType = btn.dataset.val;
  document.querySelectorAll("#assetTypeToggle button").forEach((b) => b.classList.toggle("active", b === btn));
});
document.getElementById("fDirection").addEventListener("change", (e) => {
  selectedDirection = e.target.value;
  updatePLPreview();
});

function autofillQuantityFromSymbol() {
  const symbol = document.getElementById("fSymbol").value.trim().toUpperCase();
  const qtyEl = document.getElementById("fQuantity");
  if (!symbol || qtyEl.value) return; // don't override something the user already typed
  const matches = TRADES.filter((t) => (t.symbol || "").toUpperCase() === symbol);
  if (!matches.length) return;
  const last = [...matches].sort((a, b) => new Date(b.entryDate) - new Date(a.entryDate))[0];
  if (last && last.quantity) {
    qtyEl.value = last.quantity;
    toast(`Quantity filled from your last ${symbol} trade (${last.quantity})`);
  }
}
document.getElementById("fSymbol").addEventListener("change", () => {
  autofillQuantityFromSymbol();
  autofillEntryPriceFromMarket();
  updateSymbolPriceHint();
});

function localDatetimeNow() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); // shift so toISOString reads as local wall-clock time
  return d.toISOString().slice(0, 16);
}
document.getElementById("fEntryDate").value = localDatetimeNow();

/* ---- Live Potential Profit / Loss preview, based on Target & Stop Loss ---- */
function updatePLPreview() {
  const box = document.getElementById("plPreviewBox");
  const entry = parseFloat(document.getElementById("fEntryPrice").value);
  const qty = parseFloat(document.getElementById("fQuantity").value);
  const target = parseFloat(document.getElementById("fTarget").value);
  const sl = parseFloat(document.getElementById("fStopLoss").value);
  const dir = selectedDirection;

  if (!isFinite(entry) || !isFinite(qty) || qty <= 0 || (!isFinite(target) && !isFinite(sl))) {
    box.style.display = "none";
    return;
  }

  const parts = [];
  let riskAmt = null, rewardAmt = null;

  if (isFinite(target)) {
    const perShare = dir === "Short" ? entry - target : target - entry;
    rewardAmt = perShare * qty;
    parts.push(`Potential Profit <b style="color:${rewardAmt >= 0 ? "var(--green)" : "var(--red)"};">${fmtINR(rewardAmt)}</b>${rewardAmt < 0 ? " ⚠ target is on the wrong side for this direction" : ""}`);
  }
  if (isFinite(sl)) {
    const perShare = dir === "Short" ? sl - entry : entry - sl;
    riskAmt = perShare * qty;
    parts.push(`Potential Loss <b style="color:${riskAmt >= 0 ? "var(--red)" : "var(--green)"};">-${fmtINR(Math.abs(riskAmt))}</b>${riskAmt < 0 ? " ⚠ stop loss is on the wrong side for this direction" : ""}`);
  }
  if (riskAmt !== null && rewardAmt !== null && riskAmt > 0 && rewardAmt > 0) {
    parts.push(`Risk:Reward <b>1 : ${(rewardAmt / riskAmt).toFixed(2)}</b>`);
  }

  box.style.display = "block";
  box.innerHTML = `<div class="muted" style="margin-bottom:4px;">If Target / Stop Loss is hit:</div>${parts.join(" &nbsp;·&nbsp; ")}`;
}
["fEntryPrice", "fQuantity", "fTarget", "fStopLoss"].forEach((id) =>
  document.getElementById(id).addEventListener("input", updatePLPreview)
);

function populateDatalists() {
  // Prefer the live market feed's exact symbol strings (so autocomplete + LTP sync
  // line up), but still include any symbols only seen in past trades.
  const marketSymbols = MARKET_PRICES.map((p) => p.symbol).filter(Boolean);
  const tradeSymbols = TRADES.map((t) => t.symbol).filter(Boolean);
  const symbols = [...new Set([...marketSymbols, ...tradeSymbols])].sort();
  const strategies = [...new Set(TRADES.map((t) => t.strategy).filter(Boolean))].sort();
  document.getElementById("symbolList").innerHTML = symbols.map((s) => `<option value="${s}"></option>`).join("");
  document.getElementById("strategyList").innerHTML = strategies.map((s) => `<option value="${s}"></option>`).join("");
}

function findMarketPrice(symbol) {
  const sym = String(symbol || "").trim().toUpperCase();
  if (!sym) return null;
  return MARKET_PRICES.find((p) => String(p.symbol).toUpperCase() === sym) || null;
}

function updateSymbolPriceHint() {
  const hint = document.getElementById("fSymbolPriceHint");
  const match = findMarketPrice(document.getElementById("fSymbol").value);
  hint.textContent = match ? `🔴 Live price: ₹${fmtNum(match.currentPrice)}` : "";
}
function autofillEntryPriceFromMarket() {
  const priceEl = document.getElementById("fEntryPrice");
  if (priceEl.value) return; // don't override something the user already typed
  const match = findMarketPrice(document.getElementById("fSymbol").value);
  if (match && isFinite(match.currentPrice)) {
    priceEl.value = match.currentPrice;
    toast(`Entry price filled from live market data (₹${fmtNum(match.currentPrice)})`);
    updatePLPreview();
  }
}
document.getElementById("fSymbol").addEventListener("input", updateSymbolPriceHint);

document.getElementById("addTradeBtn").addEventListener("click", async () => {
  const symbol = document.getElementById("fSymbol").value.trim().toUpperCase();
  const entryPrice = parseFloat(document.getElementById("fEntryPrice").value);
  const quantity = parseFloat(document.getElementById("fQuantity").value);
  const errBox = document.getElementById("formError");
  errBox.textContent = "";

  if (!symbol) { errBox.textContent = "Stock / Symbol is required."; return; }
  if (!isFinite(entryPrice) || entryPrice <= 0) { errBox.textContent = "Enter a valid entry price."; return; }
  if (!isFinite(quantity) || quantity <= 0) { errBox.textContent = "Enter a valid quantity."; return; }

  const entryDateVal = document.getElementById("fEntryDate").value;
  if (!entryDateVal) { errBox.textContent = "Entry date & time is required."; return; }
  const entryDateISO = new Date(entryDateVal).toISOString();

  const invested = parseFloat(document.getElementById("fInvested").value) || entryPrice * quantity;
  const trade = {
    assetType: selectedAssetType,
    symbol,
    direction: selectedDirection,
    entryPrice,
    quantity,
    investedAmount: invested,
    targetPrice: parseFloat(document.getElementById("fTarget").value) || null,
    stopLoss: parseFloat(document.getElementById("fStopLoss").value) || null,
    strategy: document.getElementById("fStrategy").value.trim(),
    notes: document.getElementById("fNotes").value.trim(),
    ltp: entryPrice,
    status: "Open",
    entryDate: entryDateISO,
    exitDate: null,
    exitPrice: null,
  };

  try {
    const created = await Api.createTrade(trade);
    TRADES.push(created);
    toast(`${symbol} added to Open Trades`);
    ["fSymbol", "fEntryPrice", "fQuantity", "fInvested", "fTarget", "fStopLoss", "fStrategy", "fNotes"].forEach((id) => (document.getElementById(id).value = ""));
    document.getElementById("fEntryDate").value = localDatetimeNow();
    document.getElementById("plPreviewBox").style.display = "none";
    document.getElementById("fSymbolPriceHint").textContent = "";
    closeAddTradeModal();
    renderAll();
  } catch (e) {
    errBox.textContent = e.message;
  }
});

/* ==================== SEARCH / FILTERS ==================== */
document.getElementById("searchBox").addEventListener("input", (e) => { searchTerm = e.target.value; renderOpenTradesTable(); });
document.getElementById("filtersBtn").addEventListener("click", () => {
  const bar = document.getElementById("filtersBar");
  bar.style.display = bar.style.display === "none" ? "flex" : "none";
});
document.getElementById("filterDirection").addEventListener("change", (e) => { filterDirection = e.target.value; renderOpenTradesTable(); });
document.getElementById("filterAssetType").addEventListener("change", (e) => { filterAssetType = e.target.value; renderOpenTradesTable(); });

/* ==================== EXPORT / NAV ==================== */
document.getElementById("exportCsvBtn").addEventListener("click", () => {
  const arr = openTradesList();
  const headers = ["Symbol", "Type", "Direction", "Entry Price", "LTP", "Quantity", "Invested", "P&L", "P&L %", "Target", "Stop Loss"];
  const rows = arr.map((t) => [t.symbol, t.assetType, t.direction, t.entryPrice, t.ltp, t.quantity, t.investedAmount, t.pnl.toFixed(2), t.pnlPct.toFixed(2), t.targetPrice || "", t.stopLoss || ""]);
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "open-trades-export.csv"; a.click();
  URL.revokeObjectURL(url);
});
document.getElementById("backBtn")?.addEventListener("click", () => (window.location.href = "index.html"));

/* ==================== ADD TRADE MODAL ==================== */
function openAddTradeModal() {
  document.getElementById("addTradeModalOverlay").classList.add("active");
}
function closeAddTradeModal() {
  document.getElementById("addTradeModalOverlay").classList.remove("active");
}
document.getElementById("openAddTradeBtn")?.addEventListener("click", openAddTradeModal);
document.getElementById("addTradeCancel")?.addEventListener("click", closeAddTradeModal);
document.getElementById("addTradeModalClose")?.addEventListener("click", closeAddTradeModal);

if (new URLSearchParams(window.location.search).get("add") === "1") {
  openAddTradeModal();
}

/* ==================== BOOT ==================== */
initAuthGate(init);