import { apiRequest } from "./api.js";
import { renderEntityTable, renderShellLayout, showToast, showLoader, hideLoader } from "./components.js";
import { authHeaders, fetchCurrentUser, logout } from "./page-utils.js";

let _container, _token;
let _report = null;
let _dateFrom = "";
let _dateTo = "";
let _charts = [];

export async function mount(container, token) {
  _container = container;
  _token = token;
  await loadPage();
}

async function loadPage(dateFrom = "", dateTo = "") {
  _dateFrom = dateFrom;
  _dateTo = dateTo;
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
    _report = report;
    render(user, report, dateFrom, dateTo);
  } finally {
    hideLoader();
  }
}

// ── Quick period helpers ──────────────────────────────────────────────────────

function getThisWeek() {
  const today = new Date();
  const day = today.getDay(); // 0=Sun
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((day + 6) % 7));
  return { from: monday.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10) };
}

function getThisMonth() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  return { from, to: now.toISOString().slice(0, 10) };
}

function getLastMonth() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const last = new Date(now.getFullYear(), now.getMonth(), 0);
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

// ── Chart management ──────────────────────────────────────────────────────────

function destroyCharts() {
  _charts.forEach((c) => c.destroy());
  _charts = [];
}

function initCharts(report) {
  destroyCharts();
  if (typeof Chart === "undefined") return;

  const s = report.operations_summary;
  const COLORS = {
    green: "#16a34a", blue: "#2563eb", amber: "#d97706",
    red: "#dc2626", purple: "#7c3aed", slate: "#94a3b8",
  };

  // 1. Trip status doughnut
  const ctx1 = document.getElementById("chart-trip-status");
  if (ctx1) {
    if (s.total_schedules === 0) {
      ctx1.parentElement.innerHTML = '<p style="text-align:center;color:#94a3b8;padding-top:80px;">No trip data for the selected period.</p>';
    } else {
      _charts.push(new Chart(ctx1, {
        type: "doughnut",
        data: {
          labels: ["Completed", "Active", "Delayed", "Emergency", "Cancelled", "Scheduled"],
          datasets: [{
            data: [
              s.completed_schedules, s.active_schedules, s.delayed_schedules,
              s.emergency_schedules, s.cancelled_schedules, s.scheduled_schedules,
            ],
            backgroundColor: [COLORS.green, COLORS.blue, COLORS.amber, COLORS.red, COLORS.slate, "#cbd5e1"],
            borderWidth: 1,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } },
        },
      }));
    }
  }

  // 2. Route performance stacked bar (top 5 routes by trip count)
  const ctx2 = document.getElementById("chart-route-performance");
  if (ctx2) {
    const top5 = report.route_performance.filter((r) => r.trip_count > 0).slice(0, 5);
    _charts.push(new Chart(ctx2, {
      type: "bar",
      data: {
        labels: top5.map((r) => r.route_code),
        datasets: [
          { label: "Completed", data: top5.map((r) => r.completed_trips), backgroundColor: COLORS.green },
          { label: "Delayed", data: top5.map((r) => r.delayed_trips), backgroundColor: COLORS.amber },
          { label: "Emergency", data: top5.map((r) => r.emergency_trips), backgroundColor: COLORS.red },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
        plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } },
      },
    }));
  }

  // 3. Fuel consumption dual-axis bar
  const ctx3 = document.getElementById("chart-fuel-consumption");
  if (ctx3 && report.fuel_consumption.length) {
    _charts.push(new Chart(ctx3, {
      type: "bar",
      data: {
        labels: report.fuel_consumption.map((f) => f.registration_no),
        datasets: [
          {
            label: "Total Cost ($)",
            data: report.fuel_consumption.map((f) => f.total_cost),
            backgroundColor: COLORS.blue,
            yAxisID: "yCost",
          },
          {
            label: "Liters",
            data: report.fuel_consumption.map((f) => f.total_liters),
            backgroundColor: COLORS.purple,
            yAxisID: "yLiters",
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          yCost: { type: "linear", position: "left", beginAtZero: true, title: { display: true, text: "Cost ($)" } },
          yLiters: { type: "linear", position: "right", beginAtZero: true, title: { display: true, text: "Liters" }, grid: { drawOnChartArea: false } },
        },
        plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } },
      },
    }));
  }
}

// ── Render ────────────────────────────────────────────────────────────────────

function render(user, report, dateFrom, dateTo) {
  const s = report.operations_summary;
  const completionRate = s.total_schedules
    ? Math.round((s.completed_schedules / s.total_schedules) * 100)
    : 0;

  _container.innerHTML = renderShellLayout({
    user,
    activeNav: "reports",
    title: "Reports & Analytics",
    subtitle: "Operational overview — route performance, fuel usage, and maintenance costs.",
    content: `
      <section class="dashboard-grid">

        <!-- Toolbar: date filters + quick periods + PDF export -->
        <div class="reports-toolbar">
          <div class="date-filter-bar">
            <div class="field">
              <label>From</label>
              <input type="date" id="date-from" value="${dateFrom}">
            </div>
            <div class="field">
              <label>To</label>
              <input type="date" id="date-to" value="${dateTo}">
            </div>
            <button class="primary-btn reports-apply-btn" id="apply-filter-btn">Apply</button>
            <button class="ghost-btn reports-clear-btn" id="clear-filter-btn">Clear</button>
          </div>
          <div class="reports-quickfilter">
            <span class="reports-quickfilter-label">Quick:</span>
            <button class="ghost-btn reports-period-btn" id="filter-this-week" type="button">This Week</button>
            <button class="ghost-btn reports-period-btn" id="filter-this-month" type="button">This Month</button>
            <button class="ghost-btn reports-period-btn" id="filter-last-month" type="button">Last Month</button>
            <button class="ghost-btn export-pdf-btn" id="export-pdf-btn" type="button">Export PDF</button>
          </div>
        </div>

        <!-- Summary stats row 1 -->
        <div class="stats-grid">
          <article class="stat-card"><div class="stat-card-body"><span>Total Routes</span><strong>${s.total_routes}</strong></div></article>
          <article class="stat-card"><div class="stat-card-body"><span>Total Schedules</span><strong>${s.total_schedules}</strong></div></article>
          <article class="stat-card"><div class="stat-card-body"><span>Completed Trips</span><strong>${s.completed_schedules}</strong></div></article>
          <article class="stat-card"><div class="stat-card-body"><span>Completion Rate</span><strong>${completionRate}%</strong></div></article>
          <article class="stat-card"><div class="stat-card-body"><span>Total Fuel Cost</span><strong>$${s.total_fuel_cost.toFixed(2)}</strong></div></article>
        </div>

        <!-- Summary stats row 2 -->
        <div class="stats-grid stats-grid-4">
          <article class="stat-card"><div class="stat-card-body"><span>Active Schedules</span><strong>${s.active_schedules}</strong></div></article>
          <article class="stat-card"><div class="stat-card-body"><span>Delayed</span><strong>${s.delayed_schedules}</strong></div></article>
          <article class="stat-card"><div class="stat-card-body"><span>Emergency</span><strong>${s.emergency_schedules}</strong></div></article>
          <article class="stat-card"><div class="stat-card-body"><span>Maint. Cost</span><strong>$${s.total_maintenance_cost.toFixed(2)}</strong></div></article>
        </div>

        <!-- Charts row: doughnut + stacked bar -->
        <div class="reports-charts-grid">
          <section class="panel">
            <h3>Trip Status Breakdown</h3>
            <div class="chart-wrap">
              <canvas id="chart-trip-status"></canvas>
            </div>
          </section>
          <section class="panel">
            <h3>Route Performance — Top 5</h3>
            <div class="chart-wrap">
              <canvas id="chart-route-performance"></canvas>
            </div>
          </section>
        </div>

        <!-- Fuel consumption bar chart -->
        <section class="panel">
          <h3>Fuel Consumption by Vehicle</h3>
          <div class="chart-wrap chart-wrap-sm">
            <canvas id="chart-fuel-consumption"></canvas>
          </div>
        </section>

        <!-- Route Performance table -->
        <section class="panel">
          <h3>Route Performance</h3>
          ${renderEntityTable({
            columns: ["Route Code", "Route Name", "Total Trips", "Completed", "Delayed", "Emergency", "Completion Rate"],
            rows: report.route_performance.map((r) => `
              <tr>
                <td>${r.route_code}</td>
                <td>${r.route_name}</td>
                <td>${r.trip_count}</td>
                <td>${r.completed_trips}</td>
                <td>${r.delayed_trips}</td>
                <td>${r.emergency_trips}</td>
                <td><strong style="color:${r.completion_rate >= 80 ? "#16a34a" : r.completion_rate >= 50 ? "#d97706" : "#dc2626"}">${r.completion_rate}%</strong></td>
              </tr>
            `),
            emptyMessage: "No route performance data available for the selected period.",
          })}
        </section>

        <!-- Driver Performance table -->
        <section class="panel">
          <h3>Driver Performance</h3>
          ${renderEntityTable({
            columns: ["Driver", "Total Trips", "Completed", "Delayed", "Completion Rate"],
            rows: report.driver_performance.map((d) => `
              <tr>
                <td>${d.driver_name}</td>
                <td>${d.trip_count}</td>
                <td>${d.completed_trips}</td>
                <td>${d.delayed_trips}</td>
                <td><strong style="color:${d.completion_rate >= 80 ? "#16a34a" : d.completion_rate >= 50 ? "#d97706" : "#dc2626"}">${d.completion_rate}%</strong></td>
              </tr>
            `),
            emptyMessage: "No driver performance data available for the selected period.",
          })}
        </section>

        <!-- Fuel + Maintenance side by side -->
        <div class="reports-bottom-grid">
          <section class="panel">
            <h3>Fuel Consumption</h3>
            ${renderEntityTable({
              columns: ["Vehicle", "Fuel Logs", "Total Liters", "Efficiency (L/100km)", "Total Cost"],
              rows: report.fuel_consumption.map((f) => `
                <tr>
                  <td>${f.registration_no}</td>
                  <td>${f.log_count}</td>
                  <td>${f.total_liters.toFixed(1)} L</td>
                  <td>${f.avg_efficiency_l_per_100km != null ? f.avg_efficiency_l_per_100km.toFixed(2) + " L/100km" : "—"}</td>
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

  // bind all events
  document.getElementById("logout-btn").addEventListener("click", () => logout(_token));
  document.getElementById("export-pdf-btn").addEventListener("click", exportPDF);
  document.getElementById("apply-filter-btn").addEventListener("click", () => {
    const from = document.getElementById("date-from").value;
    const to = document.getElementById("date-to").value;
    loadPage(from, to).catch((e) => showToast(e.message, "error"));
  });
  document.getElementById("clear-filter-btn").addEventListener("click", () => {
    loadPage().catch((e) => showToast(e.message, "error"));
  });
  document.getElementById("filter-this-week").addEventListener("click", () => {
    const { from, to } = getThisWeek();
    loadPage(from, to).catch((e) => showToast(e.message, "error"));
  });
  document.getElementById("filter-this-month").addEventListener("click", () => {
    const { from, to } = getThisMonth();
    loadPage(from, to).catch((e) => showToast(e.message, "error"));
  });
  document.getElementById("filter-last-month").addEventListener("click", () => {
    const { from, to } = getLastMonth();
    loadPage(from, to).catch((e) => showToast(e.message, "error"));
  });

  // initialize charts after DOM is ready
  requestAnimationFrame(() => initCharts(report));
}

// ── PDF Export ────────────────────────────────────────────────────────────────

async function exportPDF() {
  if (typeof html2pdf === "undefined") {
    showToast("PDF library not available. Please refresh the page.", "error");
    return;
  }
  if (!_report) {
    showToast("No report data to export.", "error");
    return;
  }

  const btn = document.getElementById("export-pdf-btn");
  btn.textContent = "Generating…";
  btn.disabled = true;

  try {
    await html2pdf()
      .set({
        margin: [12, 12, 12, 12],
        filename: buildFilename(_dateFrom, _dateTo),
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      })
      .from(buildPDFHTML(_report, _dateFrom, _dateTo))
      .save();
    showToast("PDF exported successfully.");
  } catch {
    showToast("Failed to generate PDF. Please try again.", "error");
  } finally {
    btn.textContent = "Export PDF";
    btn.disabled = false;
  }
}

function buildFilename(dateFrom, dateTo) {
  const today = new Date().toISOString().slice(0, 10);
  if (dateFrom && dateTo) return `SRMSS_Report_${dateFrom}_to_${dateTo}.pdf`;
  if (dateFrom) return `SRMSS_Report_from_${dateFrom}.pdf`;
  if (dateTo) return `SRMSS_Report_to_${dateTo}.pdf`;
  return `SRMSS_Report_${today}.pdf`;
}

function buildPDFHTML(report, dateFrom, dateTo) {
  const s = report.operations_summary;
  const genDate = new Date().toLocaleString();
  const completionRate = s.total_schedules
    ? Math.round((s.completed_schedules / s.total_schedules) * 100)
    : 0;
  const periodLabel =
    dateFrom && dateTo ? `${dateFrom}  to  ${dateTo}` :
    dateFrom ? `From ${dateFrom}` :
    dateTo   ? `Up to ${dateTo}` :
    "All Time";

  const TH  = `padding:8px 10px;background:#1e293b;color:#fff;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;text-align:left;`;
  const TD  = `padding:7px 10px;font-size:11px;color:#334155;border-bottom:1px solid #e2e8f0;`;
  const TDr = TD + `text-align:right;`;
  const TDc = TD + `text-align:center;`;
  const ALT = `background:#f8fafc;`;

  function statCard(label, value) {
    return `<td style="padding:6px;">
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 14px;">
        <div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px;">${label}</div>
        <div style="font-size:20px;font-weight:700;color:#1e293b;">${value}</div>
      </div>
    </td>`;
  }

  function sectionHeader(title) {
    return `<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding-bottom:6px;border-bottom:2px solid #1e293b;margin:20px 0 14px;">
      ${title}
    </div>`;
  }

  const routeRows = report.route_performance.length
    ? report.route_performance.map((r, i) => {
        const rateColor = r.completion_rate >= 80 ? "#16a34a" : r.completion_rate >= 50 ? "#d97706" : "#dc2626";
        return `<tr ${i % 2 ? `style="${ALT}"` : ""}>
          <td style="${TD}">${r.route_code}</td>
          <td style="${TD}">${r.route_name}</td>
          <td style="${TDc}">${r.trip_count}</td>
          <td style="${TDc};color:#16a34a;">${r.completed_trips}</td>
          <td style="${TDc};color:#d97706;">${r.delayed_trips}</td>
          <td style="${TDc};color:#dc2626;">${r.emergency_trips}</td>
          <td style="${TDc};color:${rateColor};font-weight:700;">${r.completion_rate}%</td>
        </tr>`;
      }).join("")
    : `<tr><td colspan="7" style="${TD};text-align:center;color:#94a3b8;font-style:italic;">No route data for selected period</td></tr>`;

  const driverRows = report.driver_performance.length
    ? report.driver_performance.map((d, i) => {
        const rateColor = d.completion_rate >= 80 ? "#16a34a" : d.completion_rate >= 50 ? "#d97706" : "#dc2626";
        return `<tr ${i % 2 ? `style="${ALT}"` : ""}>
          <td style="${TD}">${d.driver_name}</td>
          <td style="${TDc}">${d.trip_count}</td>
          <td style="${TDc};color:#16a34a;">${d.completed_trips}</td>
          <td style="${TDc};color:#d97706;">${d.delayed_trips}</td>
          <td style="${TDc};color:${rateColor};font-weight:700;">${d.completion_rate}%</td>
        </tr>`;
      }).join("")
    : `<tr><td colspan="5" style="${TD};text-align:center;color:#94a3b8;font-style:italic;">No driver data for selected period</td></tr>`;

  const fuelRows = report.fuel_consumption.length
    ? report.fuel_consumption.map((f, i) => `
        <tr ${i % 2 ? `style="${ALT}"` : ""}>
          <td style="${TD}">${f.registration_no}</td>
          <td style="${TDc}">${f.log_count}</td>
          <td style="${TDr}">${f.total_liters.toFixed(1)} L</td>
          <td style="${TDr}">${f.avg_efficiency_l_per_100km != null ? f.avg_efficiency_l_per_100km.toFixed(2) + " L/100km" : "—"}</td>
          <td style="${TDr}">$${f.total_cost.toFixed(2)}</td>
        </tr>`).join("")
    : `<tr><td colspan="5" style="${TD};text-align:center;color:#94a3b8;font-style:italic;">No fuel data for selected period</td></tr>`;

  const maintRows = report.maintenance_costs.length
    ? report.maintenance_costs.map((m, i) => `
        <tr ${i % 2 ? `style="${ALT}"` : ""}>
          <td style="${TD}">${m.registration_no}</td>
          <td style="${TDc}">${m.maintenance_count}</td>
          <td style="${TDc}">${m.in_progress_count}</td>
          <td style="${TDr}">$${m.total_cost.toFixed(2)}</td>
        </tr>`).join("")
    : `<tr><td colspan="4" style="${TD};text-align:center;color:#94a3b8;font-style:italic;">No maintenance data for selected period</td></tr>`;

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;max-width:760px;margin:0 auto;">

      <!-- Header -->
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:6px;margin-bottom:24px;">
        <tr>
          <td style="padding:26px 28px;">
            <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px;">
              Smart Route Management Support System
            </div>
            <div style="font-size:24px;font-weight:700;color:#fff;margin-bottom:14px;">Operational Report</div>
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-right:32px;font-size:11px;color:#cbd5e1;">
                  <span style="color:#94a3b8;">Period: </span><strong>${periodLabel}</strong>
                </td>
                <td style="font-size:11px;color:#cbd5e1;">
                  <span style="color:#94a3b8;">Generated: </span><strong>${genDate}</strong>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      ${sectionHeader("Operations Summary")}
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
        <tr>
          ${statCard("Total Routes", s.total_routes)}
          ${statCard("Total Schedules", s.total_schedules)}
          ${statCard("Completed Trips", s.completed_schedules)}
          ${statCard("Completion Rate", completionRate + "%")}
        </tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
        <tr>
          ${statCard("Active", s.active_schedules)}
          ${statCard("Delayed", s.delayed_schedules)}
          ${statCard("Emergency", s.emergency_schedules)}
          ${statCard("Cancelled", s.cancelled_schedules)}
        </tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr>
          <td style="padding:6px;width:50%;">
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 14px;">
              <div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px;">Total Fuel Cost</div>
              <div style="font-size:20px;font-weight:700;color:#1e293b;">$${s.total_fuel_cost.toFixed(2)}</div>
            </div>
          </td>
          <td style="padding:6px;width:50%;">
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 14px;">
              <div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px;">Total Maintenance Cost</div>
              <div style="font-size:20px;font-weight:700;color:#1e293b;">$${s.total_maintenance_cost.toFixed(2)}</div>
            </div>
          </td>
        </tr>
      </table>

      ${sectionHeader("Route Performance")}
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">
        <thead>
          <tr>
            <th style="${TH}">Route Code</th>
            <th style="${TH}">Route Name</th>
            <th style="${TH};text-align:center;">Total Trips</th>
            <th style="${TH};text-align:center;">Completed</th>
            <th style="${TH};text-align:center;">Delayed</th>
            <th style="${TH};text-align:center;">Emergency</th>
            <th style="${TH};text-align:center;">Rate</th>
          </tr>
        </thead>
        <tbody>${routeRows}</tbody>
      </table>

      ${sectionHeader("Driver Performance")}
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">
        <thead>
          <tr>
            <th style="${TH}">Driver</th>
            <th style="${TH};text-align:center;">Total Trips</th>
            <th style="${TH};text-align:center;">Completed</th>
            <th style="${TH};text-align:center;">Delayed</th>
            <th style="${TH};text-align:center;">Completion Rate</th>
          </tr>
        </thead>
        <tbody>${driverRows}</tbody>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr>
          <!-- Fuel Consumption -->
          <td style="vertical-align:top;width:50%;padding-right:12px;">
            ${sectionHeader("Fuel Consumption")}
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              <thead>
                <tr>
                  <th style="${TH}">Vehicle</th>
                  <th style="${TH};text-align:center;">Logs</th>
                  <th style="${TH};text-align:right;">Liters</th>
                  <th style="${TH};text-align:right;">Efficiency</th>
                  <th style="${TH};text-align:right;">Cost</th>
                </tr>
              </thead>
              <tbody>${fuelRows}</tbody>
            </table>
          </td>
          <!-- Maintenance Costs -->
          <td style="vertical-align:top;width:50%;padding-left:12px;">
            ${sectionHeader("Maintenance Costs")}
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              <thead>
                <tr>
                  <th style="${TH}">Vehicle</th>
                  <th style="${TH};text-align:center;">Records</th>
                  <th style="${TH};text-align:center;">In Progress</th>
                  <th style="${TH};text-align:right;">Cost</th>
                </tr>
              </thead>
              <tbody>${maintRows}</tbody>
            </table>
          </td>
        </tr>
      </table>

      <!-- Footer -->
      <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0;">
        <tr>
          <td style="padding-top:10px;font-size:9px;color:#94a3b8;">Smart Route Management Support System (SRMSS)</td>
          <td style="padding-top:10px;font-size:9px;color:#94a3b8;text-align:right;">Generated on ${genDate}</td>
        </tr>
      </table>

    </div>`;
}
