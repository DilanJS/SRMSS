import { apiRequest } from "./api.js";
import { renderEntityTable, renderShellLayout, showToast, showLoader, hideLoader } from "./components.js";
import { authHeaders, fetchCurrentUser, logout } from "./page-utils.js";

let _container, _token;

export async function mount(container, token) {
  _container = container;
  _token = token;
  await loadPage();
}

async function loadPage(dateFrom = "", dateTo = "") {
  showLoader("Loading Reports…");
  try {
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", new Date(dateFrom).toISOString());
    if (dateTo) params.set("date_to", new Date(dateTo + "T23:59:59").toISOString());
    const url = `/reports/overview${params.toString() ? "?" + params.toString() : ""}`;

    const [user, report] = await Promise.all([
      fetchCurrentUser(_token),
      apiRequest(url, { headers: authHeaders(_token) }),
    ]);
    render(user, report, dateFrom, dateTo);
  } finally {
    hideLoader();
  }
}

function render(user, report, dateFrom, dateTo) {
  const s = report.operations_summary;

  _container.innerHTML = renderShellLayout({
    user,
    activeNav: "reports",
    title: "Reports & Analytics",
    subtitle: "Operational overview — route performance, fuel usage, and maintenance costs.",
    content: `
      <section class="dashboard-grid">
        <div class="date-filter-bar">
          <div class="field">
            <label>From</label>
            <input type="date" id="date-from" value="${dateFrom}">
          </div>
          <div class="field">
            <label>To</label>
            <input type="date" id="date-to" value="${dateTo}">
          </div>
          <button class="primary-btn" id="apply-filter-btn" style="align-self:flex-end">Apply</button>
          <button class="ghost-btn" id="clear-filter-btn" style="align-self:flex-end">Clear</button>
        </div>

        <div class="stats-grid">
          <article class="stat-card"><div class="stat-card-body"><span>Total Routes</span><strong>${s.total_routes}</strong></div></article>
          <article class="stat-card"><div class="stat-card-body"><span>Total Schedules</span><strong>${s.total_schedules}</strong></div></article>
          <article class="stat-card"><div class="stat-card-body"><span>Completed Trips</span><strong>${s.completed_schedules}</strong></div></article>
          <article class="stat-card"><div class="stat-card-body"><span>Total Fuel Cost</span><strong>$${s.total_fuel_cost.toFixed(2)}</strong></div></article>
          <article class="stat-card"><div class="stat-card-body"><span>Maint. Cost</span><strong>$${s.total_maintenance_cost.toFixed(2)}</strong></div></article>
        </div>

        <div class="stats-grid" style="grid-template-columns:repeat(4,minmax(0,1fr))">
          <article class="stat-card"><div class="stat-card-body"><span>Active Schedules</span><strong>${s.active_schedules}</strong></div></article>
          <article class="stat-card"><div class="stat-card-body"><span>Delayed</span><strong>${s.delayed_schedules}</strong></div></article>
          <article class="stat-card"><div class="stat-card-body"><span>Emergency</span><strong>${s.emergency_schedules}</strong></div></article>
          <article class="stat-card"><div class="stat-card-body"><span>Completion Rate</span><strong>${s.total_schedules ? Math.round((s.completed_schedules / s.total_schedules) * 100) : 0}%</strong></div></article>
        </div>

        <section class="panel">
          <h3>Route Performance</h3>
          ${renderEntityTable({
            columns: ["Route Code", "Route Name", "Total Trips", "Completed", "Delayed", "Emergency"],
            rows: report.route_performance.map((r) => `
              <tr>
                <td>${r.route_code}</td>
                <td>${r.route_name}</td>
                <td>${r.trip_count}</td>
                <td>${r.completed_trips}</td>
                <td>${r.delayed_trips}</td>
                <td>${r.emergency_trips}</td>
              </tr>
            `),
            emptyMessage: "No route performance data available for the selected period.",
          })}
        </section>

        <div class="management-grid">
          <section class="panel">
            <h3>Fuel Consumption</h3>
            ${renderEntityTable({
              columns: ["Vehicle", "Fuel Logs", "Total Liters", "Total Cost"],
              rows: report.fuel_consumption.map((f) => `
                <tr>
                  <td>${f.registration_no}</td>
                  <td>${f.log_count}</td>
                  <td>${f.total_liters.toFixed(1)} L</td>
                  <td>$${f.total_cost.toFixed(2)}</td>
                </tr>
              `),
              emptyMessage: "No fuel data available for the selected period.",
            })}
          </section>
          <section class="panel">
            <h3>Maintenance Costs</h3>
            ${renderEntityTable({
              columns: ["Vehicle", "Records", "In Progress", "Total Cost"],
              rows: report.maintenance_costs.map((m) => `
                <tr>
                  <td>${m.registration_no}</td>
                  <td>${m.maintenance_count}</td>
                  <td>${m.in_progress_count}</td>
                  <td>$${m.total_cost.toFixed(2)}</td>
                </tr>
              `),
              emptyMessage: "No maintenance cost data available for the selected period.",
            })}
          </section>
        </div>
      </section>
    `,
  });

  document.getElementById("logout-btn").addEventListener("click", () => logout(_token));
  document.getElementById("apply-filter-btn").addEventListener("click", () => {
    const from = document.getElementById("date-from").value;
    const to = document.getElementById("date-to").value;
    showLoader("Applying Filter…");
    loadPage(from, to).catch((e) => { hideLoader(); showToast(e.message, "error"); });
  });
  document.getElementById("clear-filter-btn").addEventListener("click", () => {
    showLoader("Loading Reports…");
    loadPage().catch((e) => { hideLoader(); showToast(e.message, "error"); });
  });
}
