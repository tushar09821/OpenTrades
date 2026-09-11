/**
 * shell.js — injects the shared login-gate modal markup (required by
 * initAuthGate in utils.js) and small chrome behaviors (mobile sidebar
 * toggle, active-nav highlighting) on every page.
 */
(function () {
  const authHtml = `
  <div class="modal-overlay auth-overlay" id="authModalOverlay">
    <div class="modal auth-modal">
      <div class="brand-mark">📈</div>
      <h3>Trading Strategy Simulator</h3>
      <p class="sub">Sign in to sync your trades across devices.</p>
      <div class="modal-body">
        <form id="authForm">
          <div class="field">
            <label for="authUsername">Username</label>
            <input id="authUsername" name="username" type="text" autocomplete="username" required />
          </div>
          <div class="field">
            <label for="authPassword">Password</label>
            <input id="authPassword" name="password" type="password" autocomplete="current-password" required />
          </div>
          <div class="form-error" id="authError"></div>
          <button type="submit" class="btn btn-primary btn-block" id="authSubmit">Sign In</button>
        </form>
      </div>
    </div>
  </div>`;
  // Runs immediately (this script tag sits at the end of <body>, so the
  // rest of the page markup — including #menuToggle / #signOutBtn — is
  // already in the DOM). This must NOT wait for DOMContentLoaded, because
  // page scripts loaded right after this one call initAuthGate() synchronously
  // and need #authModalOverlay to already exist.
  document.body.insertAdjacentHTML("beforeend", authHtml);

  // Highlight the current page in the sidebar / pill-tabs based on the
  // actual URL rather than a hard-coded "active" class in each page's markup.
  // This is recalculated on every load (including back/forward-cache
  // restores via pageshow), so the highlight can never get stuck on a
  // page you're no longer viewing.
  function syncActiveNav() {
    const currentFile = location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".nav-item[href], .pill-tab[href]").forEach((a) => {
      const linkFile = a.getAttribute("href").split("/").pop();
      a.classList.toggle("active", linkFile === currentFile);
    });
  }
  syncActiveNav();
  window.addEventListener("pageshow", syncActiveNav);

  // Mobile sidebar toggle (hooked to #menuToggle if present on the page)
  const menuBtn = document.getElementById("menuToggle");
  const sidebar = document.querySelector(".sidebar");
  if (menuBtn && sidebar) {
    menuBtn.addEventListener("click", () => sidebar.classList.toggle("open"));
    document.addEventListener("click", (e) => {
      if (!sidebar.contains(e.target) && e.target !== menuBtn && sidebar.classList.contains("open")) {
        sidebar.classList.remove("open");
      }
    });
  }

  // Sign-out button (hooked to #signOutBtn if present)
  const signOutBtn = document.getElementById("signOutBtn");
  if (signOutBtn) {
    signOutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      Api.signOut();
      toast("Signed out");
      setTimeout(() => location.reload(), 400);
    });
  }
})();