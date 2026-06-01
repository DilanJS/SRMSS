const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", href: "/frontend/app.html#/dashboard" },
  { key: "routes", label: "Routes", href: "/frontend/app.html#/routes" },
  { key: "vehicles", label: "Vehicles", href: "/frontend/app.html#/vehicles" },
  { key: "drivers", label: "Drivers", href: "/frontend/app.html#/drivers" },
  { key: "schedules", label: "Schedules", href: "/frontend/app.html#/schedules" },
  { key: "maintenance", label: "Fuel & Maintenance", href: "/frontend/app.html#/maintenance" },
  { key: "reports", label: "Reports", href: "/frontend/app.html#/reports" },
  { key: "profile", label: "My Profile", href: "/frontend/app.html#/profile" },
];

export function renderLoginForm() {
  return `
    <section class="auth-layout">
      <div class="auth-hero">
        <div>
          <span class="eyebrow">Smart Route Operations</span>
          <h1 class="auth-title">Operate the depot from one decisive control room.</h1>
          <p class="auth-copy">
            SRMSS brings schedules, fleet health, route coverage, and operational reporting
            into one live workspace for depot administrators and managers.
          </p>
          <div class="hero-stats">
            <div class="hero-stat"><strong>8</strong><span>Core modules aligned to the project plan.</span></div>
            <div class="hero-stat"><strong>Live</strong><span>Backend modules already connected to Firebase or local fallback.</span></div>
            <div class="hero-stat"><strong>1</strong><span>Shared system entry for admin and management teams.</span></div>
          </div>
        </div>
      </div>
      <div class="auth-panel">
        <section class="auth-card">
          <h2>Sign In</h2>
          <p>Use your SRMSS account to access the protected operations dashboard.</p>
          <form id="login-form" class="form-grid">
            <div class="field">
              <label for="email">Email</label>
              <input id="email" name="email" type="email" placeholder="admin@srmss.local" required>
            </div>
            <div class="field">
              <label for="password">Password</label>
              <input id="password" name="password" type="password" placeholder="Enter your password" required>
            </div>
            <div class="error-text" id="login-error"></div>
            <button class="primary-btn" id="login-submit" type="submit">Enter Dashboard</button>
          </form>
        </section>
      </div>
    </section>
  `;
}

export function renderDashboardShell({ user, statsCards, scheduleItems, utilization }) {
  return renderShellLayout({
    user,
    activeNav: "dashboard",
    title: "Operations Dashboard",
    subtitle: "Live depot view for schedules, fleet readiness, and current service pressure.",
    content: `
      <section class="dashboard-grid">
        <div class="stats-grid">
          ${statsCards.map(renderStatCard).join("")}
        </div>
        <div class="panels-grid">
          <section class="panel">
            <h3>Live Schedule Window</h3>
            <div class="schedule-list">
              ${scheduleItems.length ? scheduleItems.map(renderScheduleItem).join("") : `<p class="empty-note">No active or near-term schedules are currently visible.</p>`}
            </div>
          </section>
          <section class="panel">
            <h3>Utilization</h3>
            <div class="utilization-grid">
              <div class="util-card">
                <span>Vehicle Utilization</span>
                <strong>${utilization.vehicle_utilization_percent}%</strong>
              </div>
              <div class="util-card">
                <span>Driver Utilization</span>
                <strong>${utilization.driver_utilization_percent}%</strong>
              </div>
            </div>
          </section>
        </div>
      </section>
    `,
  });
}

export function renderManagementPage({
  user,
  activeNav,
  title,
  subtitle,
  statsCards,
  filterMarkup,
  formTitle,
  formMarkup,
  tableTitle,
  tableMarkup,
}) {
  const hasForm = Boolean(formMarkup);
  return renderShellLayout({
    user,
    activeNav,
    title,
    subtitle,
    content: `
      <section class="dashboard-grid">
        <div class="stats-grid">
          ${statsCards.map(renderStatCard).join("")}
        </div>
        ${hasForm ? `
          <div class="management-grid">
            <section class="panel">
              <h3>${tableTitle}</h3>
              ${filterMarkup}
              ${tableMarkup}
            </section>
            <section class="panel">
              <h3>${formTitle}</h3>
              ${formMarkup}
            </section>
          </div>
        ` : `
          <section class="panel">
            <h3>${tableTitle}</h3>
            ${filterMarkup}
            ${tableMarkup}
          </section>
        `}
      </section>
    `,
  });
}

export function renderShellLayout({ user, activeNav, title, subtitle, content }) {
  return `
    <section class="dashboard-shell">
      <aside class="sidebar">
        <div class="brand">
          <strong>SRMSS</strong>
          <span>Smart Route Management and Scheduling System</span>
        </div>
        <nav class="nav-list">
          ${NAV_ITEMS.map((item) => renderNavItem(item, activeNav)).join("")}
        </nav>
      </aside>
      <section class="shell-main">
        <header class="topbar">
          <div class="topbar-title">
            <h1>${title}</h1>
            <p>${subtitle}</p>
          </div>
          <div class="topbar-actions">
            <div class="user-chip">
              <div class="user-avatar">${getInitials(user.full_name)}</div>
              <div>
                <strong>${user.full_name}</strong><br>
                <span>${user.role}</span>
              </div>
            </div>
            <button class="ghost-btn" id="logout-btn" type="button">Logout</button>
          </div>
        </header>
        ${content}
      </section>
    </section>
  `;
}

export function renderEntityTable({ columns, rows, emptyMessage }) {
  if (!rows.length) {
    return `<p class="empty-note">${emptyMessage}</p>`;
  }

  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>${columns.map((column) => `<th>${column}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${rows.join("")}
        </tbody>
      </table>
    </div>
  `;
}

export function renderFilters(markup) {
  return `<div class="filter-bar">${markup}</div>`;
}

export function renderInlineError(id) {
  return `<div class="error-text" id="${id}"></div>`;
}

function renderNavItem(item, activeNav) {
  const activeClass = item.key === activeNav ? "active" : "";
  if (item.href === "#") {
    return `<div class="nav-item ${activeClass}">${item.label}</div>`;
  }
  return `<a class="nav-item ${activeClass}" href="${item.href}">${item.label}</a>`;
}

function renderStatCard(card) {
  return `
    <article class="stat-card">
      <span>${card.label}</span>
      <strong>${card.value}</strong>
    </article>
  `;
}

function renderScheduleItem(item) {
  return `
    <article class="schedule-item">
      <div>
        <strong>Route ${item.route_id}</strong>
        <div class="schedule-meta">Vehicle ${item.vehicle_id} | Driver ${item.driver_id}</div>
        <div class="schedule-meta">${formatDate(item.departure_time)} to ${formatDate(item.arrival_time)}</div>
      </div>
      <div>
        <span class="badge ${item.status}">${item.status}</span>
      </div>
    </article>
  `;
}

function formatDate(value) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getInitials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

// ── Side Panel ───────────────────────────────────────────────────────────────

export function openSidePanel({ title, subtitle = "", body, footer = "" }) {
  closeSidePanel();

  const overlay = document.createElement("div");
  overlay.className = "side-panel-overlay";
  overlay.id = "side-panel-overlay";

  const panel = document.createElement("div");
  panel.className = "side-panel";
  panel.id = "side-panel";
  panel.innerHTML = `
    <div class="side-panel-header">
      <div>
        <h2 class="side-panel-title">${title}</h2>
        ${subtitle ? `<p class="side-panel-subtitle">${subtitle}</p>` : ""}
      </div>
      <button class="side-panel-close" id="side-panel-close" type="button">✕</button>
    </div>
    <div class="side-panel-body">${body}</div>
    ${footer ? `<div class="side-panel-footer">${footer}</div>` : ""}
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(panel);

  requestAnimationFrame(() => {
    overlay.classList.add("visible");
    panel.classList.add("open");
  });

  overlay.addEventListener("click", closeSidePanel);
  document.getElementById("side-panel-close").addEventListener("click", closeSidePanel);
}

export function closeSidePanel() {
  const overlay = document.getElementById("side-panel-overlay");
  const panel = document.getElementById("side-panel");
  if (!panel) return;

  overlay?.classList.remove("visible");
  panel.classList.remove("open");

  panel.addEventListener("transitionend", () => {
    overlay?.remove();
    panel.remove();
  }, { once: true });
}

// ── Full-Screen Loader ───────────────────────────────────────────────────────

export function showLoader(label = "Loading…") {
  let el = document.getElementById("fullscreen-loader");
  if (el) {
    el.querySelector(".loader-label").textContent = label;
    el.classList.remove("fade-out");
    return;
  }
  el = document.createElement("div");
  el.className = "fullscreen-loader";
  el.id = "fullscreen-loader";
  el.innerHTML = `
    <div class="loader-spinner"></div>
    <span class="loader-label">${label}</span>
  `;
  document.body.appendChild(el);
}

export function hideLoader() {
  const el = document.getElementById("fullscreen-loader");
  if (!el) return;
  el.classList.add("fade-out");
  el.addEventListener("transitionend", () => el.remove(), { once: true });
}

// ── Confirm Modal ────────────────────────────────────────────────────────────

export function showConfirm({ title, message, onConfirm }) {
  document.getElementById("confirm-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.id = "confirm-overlay";
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true">
      <h3 class="modal-title">${title}</h3>
      <p class="modal-body">${message}</p>
      <div class="modal-actions">
        <button class="ghost-btn" id="confirm-cancel">Cancel</button>
        <button class="primary-btn danger-btn" id="confirm-ok">Confirm</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("visible"));

  const close = () => {
    overlay.classList.remove("visible");
    overlay.addEventListener("transitionend", () => overlay.remove(), { once: true });
  };

  overlay.querySelector("#confirm-cancel").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.querySelector("#confirm-ok").addEventListener("click", () => {
    close();
    onConfirm();
  });
}

// ── Toast Notifications ──────────────────────────────────────────────────────

export function showToast(message, type = "success") {
  let tray = document.getElementById("toast-tray");
  if (!tray) {
    tray = document.createElement("div");
    tray.id = "toast-tray";
    tray.className = "toast-tray";
    document.body.appendChild(tray);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  tray.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("visible"));

  setTimeout(() => {
    toast.classList.remove("visible");
    toast.addEventListener("transitionend", () => toast.remove(), { once: true });
  }, 3500);
}
