import { apiRequest } from "./api.js";
import { renderShellLayout, showLoader, hideLoader } from "./components.js";
import { authHeaders, fetchCurrentUser, logout } from "./page-utils.js";

let _container, _token;
let _refreshTimer = null;
const REFRESH_INTERVAL_MS = 30_000;

export async function mount(container, token) {
  _container = container;
  _token = token;
  clearInterval(_refreshTimer);
  await loadDashboard();
}

// ── Initial load ──────────────────────────────────────────────────────────────

async function loadDashboard() {
  showLoader("Loading Dashboard…");
  try {
    const [user, overview] = await Promise.all([
      fetchCurrentUser(_token),
      apiRequest("/dashboard/overview", { headers: authHeaders(_token) }),
    ]);

    _container.innerHTML = buildShell(user, overview);
    hideLoader();

    document.getElementById("logout-btn").addEventListener("click", () => logout(_token));
    startAutoRefresh();
  } catch (error) {
    hideLoader();
    if (error.status === 403) {
      _container.innerHTML = `
        <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;padding:40px;text-align:center">
          <div style="font-size:48px">🔒</div>
          <h2 style="font-family:'Space Grotesk',sans-serif;margin:0">Access Restricted</h2>
          <p style="color:var(--text-soft);max-width:360px;margin:0">
            The operations dashboard is available to admins and managers only.
            You have been logged in with a <strong>driver</strong> or <strong>user</strong> account.
          </p>
          <a href="/frontend/app.html#/schedules" style="color:var(--blue);font-weight:700">Go to Schedules →</a>
        </div>
      `;
      return;
    }
    window.location.href = "/frontend/index.html";
  }
}

// ── Auto-refresh ──────────────────────────────────────────────────────────────

function startAutoRefresh() {
  _refreshTimer = setInterval(async () => {
    // Stop if this dashboard is no longer rendered
    if (!document.getElementById("dash-stats-grid")) {
      clearInterval(_refreshTimer);
      return;
    }
    try {
      const overview = await apiRequest("/dashboard/overview", { headers: authHeaders(_token) });
      updateDynamicSections(overview);
    } catch {
      // Silent — don't disrupt the user on transient refresh failures
    }
  }, REFRESH_INTERVAL_MS);
}

function updateDynamicSections(overview) {
  const statsEl = document.getElementById("dash-stats-grid");
  const liveEl = document.getElementById("dash-live-list");
  const utilEl = document.getElementById("dash-util-grid");
  const tsEl = document.getElementById("dash-refresh-ts");

  if (statsEl) statsEl.innerHTML = buildStatCards(overview.counts);
  if (liveEl) liveEl.innerHTML = buildLiveList(overview.live_schedule_window);
  if (utilEl) utilEl.innerHTML = buildUtilGrid(overview.utilization);
  if (tsEl) tsEl.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
}

// ── Render helpers ────────────────────────────────────────────────────────────

function buildShell(user, overview) {
  return renderShellLayout({
    user,
    activeNav: "dashboard",
    title: "Operations Dashboard",
    subtitle: "Live depot view — schedules, fleet readiness, and current service pressure.",
    content: `
      <section class="dashboard-grid">
        <div id="dash-stats-grid" class="stats-grid">
          ${buildStatCards(overview.counts)}
        </div>
        <div class="panels-grid">
          <section class="panel">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;gap:8px">
              <h3 style="margin:0">Live Schedule Window</h3>
              <span id="dash-refresh-ts" style="font-size:11px;color:var(--text-soft)">
                Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            </div>
            <div id="dash-live-list" class="schedule-list">
              ${buildLiveList(overview.live_schedule_window)}
            </div>
          </section>
          <section class="panel">
            <h3>Utilization</h3>
            <div id="dash-util-grid" class="utilization-grid">
              ${buildUtilGrid(overview.utilization)}
            </div>
          </section>
        </div>
      </section>
    `,
  });
}

function buildStatCards(counts) {
  const card = (label, value, highlight = false) => `
    <article class="stat-card">
      <div class="stat-card-body">
        <span>${label}</span>
        <strong${highlight ? ' style="color:var(--blue)"' : ""}>${value}</strong>
      </div>
    </article>
  `;
  return [
    card("Active Trips", counts.active_trips),
    card("On-Time", counts.on_time_trips, true),
    card("Delayed Trips", counts.delayed_trips),
    card("Available Buses", counts.available_buses),
    card("Assigned Drivers", counts.assigned_drivers),
    card("Completed Trips", counts.completed_trips),
  ].join("");
}

function buildLiveList(items) {
  if (!items.length) {
    return `<p class="empty-note">No active or near-term schedules in the next 6 hours.</p>`;
  }
  return items.map(buildScheduleItem).join("");
}

function buildScheduleItem(item) {
  const dep = new Date(item.departure_time).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const arr = new Date(item.arrival_time).toLocaleString([], { hour: "numeric", minute: "2-digit" });

  const routeLabel = item.route_code
    ? `${item.route_code}${item.route_name ? " – " + item.route_name : ""}`
    : item.route_id;
  const vehicleLabel = item.vehicle_registration || item.vehicle_id;
  const driverLabel = item.driver_name || item.driver_id;

  const statusBadge = `<span class="badge ${item.status}">${item.status}</span>`;
  const onTimeBadge = buildOnTimeBadge(item.on_time_status, item.status);
  const emergencyBadge = item.emergency_update
    ? `<span class="badge emergency" style="font-size:10px">!</span>`
    : "";

  return `
    <article class="schedule-item">
      <div>
        <strong>${routeLabel}</strong>
        <div class="schedule-meta">${vehicleLabel} · ${driverLabel}</div>
        <div class="schedule-meta">${dep} → ${arr}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
        ${statusBadge}
        ${onTimeBadge}
        ${emergencyBadge}
      </div>
    </article>
  `;
}

function buildOnTimeBadge(onTimeStatus, status) {
  if (onTimeStatus === "on-time") {
    return `<span class="badge active" style="font-size:10px">on-time</span>`;
  }
  if (onTimeStatus === "overrunning") {
    return `<span class="badge delayed" style="font-size:10px">overrunning</span>`;
  }
  // For non-active trips, the main status badge already communicates state
  return "";
}

function buildUtilGrid(utilization) {
  return `
    <div class="util-card">
      <span>Vehicle Utilization</span>
      <strong>${utilization.vehicle_utilization_percent}%</strong>
    </div>
    <div class="util-card">
      <span>Driver Utilization</span>
      <strong>${utilization.driver_utilization_percent}%</strong>
    </div>
  `;
}
