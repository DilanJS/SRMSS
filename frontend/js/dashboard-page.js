import { apiRequest } from "./api.js";
import { clearSession } from "./auth.js";
import { renderDashboardShell, showLoader, hideLoader } from "./components.js";

let _container, _token;

export async function mount(container, token) {
  _container = container;
  _token = token;
  await loadDashboard();
}

async function loadDashboard() {
  showLoader("Loading Dashboard…");
  try {
    const [user, overview] = await Promise.all([
      apiRequest("/auth/me", { headers: { Authorization: `Bearer ${_token}` } }),
      apiRequest("/dashboard/overview", { headers: { Authorization: `Bearer ${_token}` } }),
    ]);

    _container.innerHTML = renderDashboardShell({
      user,
      statsCards: [
        { label: "Active Trips", value: overview.counts.active_trips },
        { label: "Available Buses", value: overview.counts.available_buses },
        { label: "Assigned Drivers", value: overview.counts.assigned_drivers },
        { label: "Delayed Trips", value: overview.counts.delayed_trips },
        { label: "Completed Trips", value: overview.counts.completed_trips },
      ],
      scheduleItems: overview.live_schedule_window,
      utilization: overview.utilization,
    });

    hideLoader();
    document.getElementById("logout-btn").addEventListener("click", handleLogout);
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
          <a href="/frontend/app.html#/schedules" style="color:var(--accent);font-weight:700">Go to Schedules →</a>
        </div>
      `;
      return;
    }
    clearSession();
    window.location.href = "/frontend/index.html";
  }
}

async function handleLogout() {
  try {
    await apiRequest("/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${_token}` },
    });
  } catch {
    // ignore
  } finally {
    clearSession();
    window.location.href = "/frontend/index.html";
  }
}
