const NAV_ITEMS = [
  { key: "dashboard",   label: "Dashboard",          href: "/frontend/app.html#/dashboard",   roles: ["admin", "manager"] },
  { key: "routes",      label: "Routes",              href: "/frontend/app.html#/routes",      roles: ["admin", "manager", "driver", "user"] },
  { key: "tracking",        label: "Live Tracking",  href: "/frontend/app.html#/tracking",        roles: ["admin", "manager"] },
  { key: "driver-tracker",  label: "Start Tracking", href: "/frontend/app.html#/driver-tracker",  roles: ["driver"] },
  { key: "vehicles",    label: "Vehicles",            href: "/frontend/app.html#/vehicles",    roles: ["admin", "manager"] },
  { key: "drivers",     label: "Drivers",             href: "/frontend/app.html#/drivers",     roles: ["admin", "manager"] },
  { key: "schedules",   label: "Schedules",           href: "/frontend/app.html#/schedules",   roles: ["admin", "manager", "driver"] },
  { key: "maintenance", label: "Fuel & Maintenance",  href: "/frontend/app.html#/maintenance", roles: ["admin", "manager"] },
  { key: "reports",     label: "Reports",             href: "/frontend/app.html#/reports",     roles: ["admin", "manager"] },
  { key: "users",       label: "User Management",     href: "/frontend/app.html#/users",       roles: ["admin"] },
  { key: "profile",     label: "My Profile",          href: "/frontend/app.html#/profile",     roles: ["admin", "manager", "driver", "user"] },
];

export function renderLoginForm() {
  return `
    <section class="auth-layout">
      <div class="auth-hero">
        <div class="auth-hero-content">
          <div class="auth-brand-mark">
            <div class="auth-brand-icon">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <path d="M14 2L26 8v12L14 26 2 20V8L14 2z" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/>
                <path d="M14 7l8 4v6l-8 4-8-4v-6l8-4z" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.7)" stroke-width="1"/>
              </svg>
            </div>
            <span class="auth-brand-name">SRMSS</span>
          </div>
          <h1 class="auth-title">Smart Route<br>Management</h1>
          <p class="auth-copy">Fleet operations, live tracking, and route management for depot teams.</p>
          <div class="auth-feature-list">
            <div class="auth-feature"><span class="auth-feature-dot"></span>Live vehicle GPS tracking</div>
            <div class="auth-feature"><span class="auth-feature-dot"></span>Route & schedule management</div>
            <div class="auth-feature"><span class="auth-feature-dot"></span>Fleet maintenance & reporting</div>
          </div>
        </div>
      </div>
      <div class="auth-panel">
        <section class="auth-card">
          <h2>Sign In</h2>
          <form id="login-form" class="form-grid">
            <div class="field">
              <label for="email">Email</label>
              <input id="email" name="email" type="email" placeholder="you@srmss.local" required autocomplete="email">
            </div>
            <div class="field">
              <label for="password">Password</label>
              <input id="password" name="password" type="password" placeholder="Password" required autocomplete="current-password">
            </div>
            <div class="error-text" id="login-error"></div>
            <button class="primary-btn" id="login-submit" type="submit">Sign In</button>
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
      <div class="sidebar-overlay" id="sidebar-overlay"></div>
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-header">
          <div class="brand">
            <strong>SRMSS</strong>
            <span>Smart Route Management</span>
          </div>
          <button class="sidebar-close" id="sidebar-close" type="button" aria-label="Close menu">✕</button>
        </div>
        <nav class="nav-list">
          ${NAV_ITEMS.map((item) => renderNavItem(item, activeNav, user.role)).join("")}
        </nav>
        <div class="sidebar-role-badge">
          <span class="badge ${user.role}">${user.role}</span>
          <span>${user.full_name}</span>
        </div>
      </aside>
      <section class="shell-main">
        <header class="topbar">
          <div class="topbar-left">
            <button class="hamburger-btn" id="hamburger-btn" type="button" aria-label="Open menu">
              <span></span><span></span><span></span>
            </button>
            <div class="topbar-title">
              <h1>${title}</h1>
              <p class="topbar-subtitle">${subtitle}</p>
            </div>
          </div>
          <div class="topbar-actions">
            <div class="user-chip">
              <div class="user-avatar">${getInitials(user.full_name)}</div>
              <div class="user-chip-info">
                <strong>${user.full_name}</strong>
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

export function initMobileNav() {
  const hamburger = document.getElementById("hamburger-btn");
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  const closeBtn = document.getElementById("sidebar-close");
  if (!hamburger || !sidebar) return;

  const open = () => {
    sidebar.classList.add("open");
    overlay.classList.add("visible");
    document.body.style.overflow = "hidden";
  };
  const close = () => {
    sidebar.classList.remove("open");
    overlay.classList.remove("visible");
    document.body.style.overflow = "";
  };

  hamburger.addEventListener("click", open);
  closeBtn?.addEventListener("click", close);
  overlay.addEventListener("click", close);

  // Close sidebar when a nav link is clicked on mobile
  sidebar.querySelectorAll(".nav-item").forEach((link) => {
    link.addEventListener("click", close);
  });
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

function renderNavItem(item, activeNav, role) {
  if (item.roles && !item.roles.includes(role)) return "";
  const activeClass = item.key === activeNav ? "active" : "";
  return `<a class="nav-item ${activeClass}" href="${item.href}">${item.label}</a>`;
}

function renderStatCard(card) {
  return `
    <article class="stat-card">
      <div class="stat-card-body">
        <span>${card.label}</span>
        <strong>${card.value}</strong>
      </div>
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
