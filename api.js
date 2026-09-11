/**
 * api.js — Trades Calendar / Open Trades Manager
 *
 * Talks to the SAME Cloudflare Worker as your other trade-journal project
 * (auth is shared — /login is unchanged), plus new routes this project needs.
 * See the bottom of this file for the exact list of new Worker routes to add.
 *
 * TRADE SCHEMA (single collection, open + closed trades together):
 * {
 *   id: string,
 *   assetType: "Cash/Future" | "Options",
 *   symbol: string,
 *   direction: "Long" | "Short",
 *   entryPrice: number,
 *   quantity: number,
 *   investedAmount: number,       // defaults to entryPrice*quantity, editable
 *   targetPrice: number | null,
 *   stopLoss: number | null,
 *   strategy: string,
 *   notes: string,
 *   ltp: number,                  // last traded price — updated manually while Open
 *   status: "Open" | "Closed",
 *   entryDate: ISO string,        // set on creation
 *   exitDate: ISO string | null,  // set on square-off
 *   exitPrice: number | null      // set on square-off
 * }
 */

const WORKER_BASE = "https://tiny-art-8473.dobbyop09.workers.dev";

const LS_TOKEN_KEY = "tl_token";     // shared with the other project on purpose —
const LS_USER_KEY = "tl_user";       // logging into one logs you into both.
const LS_TRADES_KEY = "ot_trades";   // local fallback cache (namespaced, won't collide)
const LS_SETTINGS_KEY = "ot_settings";

const Api = {
  base() { return WORKER_BASE; },
  token() { return localStorage.getItem(LS_TOKEN_KEY) || ""; },
  setToken(t) { t ? localStorage.setItem(LS_TOKEN_KEY, t) : localStorage.removeItem(LS_TOKEN_KEY); },
  user() {
    try { return JSON.parse(localStorage.getItem(LS_USER_KEY) || "null"); }
    catch { return null; }
  },
  setUser(u) { u ? localStorage.setItem(LS_USER_KEY, JSON.stringify(u)) : localStorage.removeItem(LS_USER_KEY); },
  isOnline() { return !!this.token(); },

  async _fetch(path, opts = {}) {
    const url = this.base() + path;
    const headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    if (this.token()) headers["Authorization"] = "Bearer " + this.token();
    const res = await fetch(url, { ...opts, headers });
    let body = null;
    try { body = await res.json(); } catch { /* no body */ }
    if (!res.ok) {
      const msg = (body && (body.error || body.message)) || `Request failed (${res.status})`;
      if (res.status === 401) {
        // Token missing/invalid/expired — clear it and tell the app to re-open the login gate,
        // instead of silently falling back to stale local data forever.
        this.signOut();
        document.dispatchEvent(new CustomEvent("auth:expired"));
      }
      throw new Error(msg);
    }
    return body;
  },

  /* ---------------- AUTH (same /login as the other project) ---------------- */
  async login(username, password) {
    const data = await this._fetch("/login", { method: "POST", body: JSON.stringify({ username, password }) });
    this.setToken(data.token);
    this.setUser({ username: data.username || username });
    return data;
  },
  signOut() { this.setToken(null); this.setUser(null); },

  /* ---------------- TRADES ---------------- */
  async listTrades() {
    if (this.isOnline()) {
      try {
        const data = await this._fetch("/trades.json");
        return data.trades || [];
      } catch (e) {
        console.warn("Worker fetch failed, falling back to local cache:", e.message);
      }
    }
    return this._localList();
  },
  async createTrade(trade) {
    if (this.isOnline()) {
      return await this._fetch("/trades", { method: "POST", body: JSON.stringify(trade) });
    }
    return this._localCreate(trade);
  },
  async updateTrade(id, updates) {
    if (this.isOnline()) {
      return await this._fetch(`/trades/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(updates) });
    }
    return this._localUpdate(id, updates);
  },
  async deleteTrade(id) {
    if (this.isOnline()) {
      await this._fetch(`/trades/${encodeURIComponent(id)}`, { method: "DELETE" });
      return true;
    }
    return this._localDelete(id);
  },

  /* ---------------- SETTINGS (Initial Capital etc.) ---------------- */
  async getSettings() {
    if (this.isOnline()) {
      try { return await this._fetch("/settings.json"); }
      catch { /* fall through to local */ }
    }
    return this._localSettings();
  },
  async saveSettings(settings) {
    if (this.isOnline()) {
      return await this._fetch("/settings.json", { method: "PUT", body: JSON.stringify(settings) });
    }
    localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(settings));
    return settings;
  },

  /* ---------------- MARKET PRICES (from your existing /dashboard-data feed) ----------------
     This route is public (no auth) on the Worker — it just returns whatever your price-alert
     workflow last wrote to dashboard/dashboard-data.json, e.g.:
     [{ symbol: "BEL", currentPrice: 409.15, ... }, ...]
     Used to auto-refresh LTP on Open trades that match a tracked symbol. */
  async getMarketPrices() {
    try {
      const res = await fetch(this.base() + "/dashboard-data");
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data.stocks || data.data || []);
    } catch (e) {
      console.warn("Market price fetch failed:", e.message);
      return [];
    }
  },

  /* ---------------- LOCAL FALLBACK (offline / worker unreachable) ---------------- */
  _localList() {
    try { return JSON.parse(localStorage.getItem(LS_TRADES_KEY) || "[]"); }
    catch { return []; }
  },
  _localSave(trades) { localStorage.setItem(LS_TRADES_KEY, JSON.stringify(trades)); },
  _localCreate(trade) {
    const trades = this._localList();
    const t = { ...trade, id: trade.id || crypto.randomUUID() };
    trades.push(t);
    this._localSave(trades);
    return t;
  },
  _localUpdate(id, updates) {
    const trades = this._localList();
    const idx = trades.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error("Trade not found");
    trades[idx] = { ...trades[idx], ...updates, id };
    this._localSave(trades);
    return trades[idx];
  },
  _localDelete(id) {
    const trades = this._localList().filter((t) => t.id !== id);
    this._localSave(trades);
    return true;
  },
  _localSettings() {
    try { return JSON.parse(localStorage.getItem(LS_SETTINGS_KEY) || "null") || { initialCapital: 500000 }; }
    catch { return { initialCapital: 500000 }; }
  },
};