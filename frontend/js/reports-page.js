import { apiRequest } from "./api.js";
import { renderEntityTable, renderShellLayout, showToast, showLoader, hideLoader } from "./components.js";
import { authHeaders, fetchCurrentUser, logout } from "./page-utils.js";

let _container, _token;
let _report = null;
let _dateFrom = "";
let _dateTo = "";

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

function render(user, report, dateFrom, dateTo) {
  const s = report.operations_summary;

  _container.innerHTML = renderShellLayout({
    user,
    activeNav: "reports",
    title: "Reports & Analytics",
    subtitle: "Operational overview — route performance, fuel usage, and maintenance costs.",
    content: `
      <section class="dashboard-grid">
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
            <button class="primary-btn" id="apply-filter-btn" style="align-self:flex-end">Apply</button>
            <button class="ghost-btn" id="clear-filter-btn" style="align-self:flex-end">Clear</button>
          </div>
          <button class="ghost-btn export-pdf-btn" id="export-pdf-btn" type="button">Export PDF</button>
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
  document.getElementById("export-pdf-btn").addEventListener("click", exportPDF);
  document.getElementById("apply-filter-btn").addEventListener("click", () => {
    const from = document.getElementById("date-from").value;
    const to = document.getElementById("date-to").value;
    loadPage(from, to).catch((e) => showToast(e.message, "error"));
  });
  document.getElementById("clear-filter-btn").addEventListener("click", () => {
    loadPage().catch((e) => showToast(e.message, "error"));
  });
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

  const TH = `padding:8px 10px;background:#1e293b;color:#fff;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;text-align:left;`;
  const TD = `padding:7px 10px;font-size:11px;color:#334155;border-bottom:1px solid #e2e8f0;`;
  const TDr = TD + `text-align:right;`;
  const TDc = TD + `text-align:center;`;
  const ALT = `background:#f8fafc;`;

  function statCard(label, value) {
    return `
      <td style="padding:6px;">
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 14px;">
          <div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px;">${label}</div>
          <div style="font-size:20px;font-weight:700;color:#1e293b;">${value}</div>
        </div>
      </td>`;
  }

  const routeRows = report.route_performance.length
    ? report.route_performance.map((r, i) => `
        <tr ${i % 2 ? `style="${ALT}"` : ""}>
          <td style="${TD}">${r.route_code}</td>
          <td style="${TD}">${r.route_name}</td>
          <td style="${TDc}">${r.trip_count}</td>
          <td style="${TDc};color:#16a34a;">${r.completed_trips}</td>
          <td style="${TDc};color:#d97706;">${r.delayed_trips}</td>
          <td style="${TDc};color:#dc2626;">${r.emergency_trips}</td>
        </tr>`).join("")
    : `<tr><td colspan="6" style="${TD};text-align:center;color:#94a3b8;font-style:italic;">No route data for selected period</td></tr>`;

  const fuelRows = report.fuel_consumption.length
    ? report.fuel_consumption.map((f, i) => `
        <tr ${i % 2 ? `style="${ALT}"` : ""}>
          <td style="${TD}">${f.registration_no}</td>
          <td style="${TDc}">${f.log_count}</td>
          <td style="${TDr}">${f.total_liters.toFixed(1)} L</td>
          <td style="${TDr}">$${f.total_cost.toFixed(2)}</td>
        </tr>`).join("")
    : `<tr><td colspan="4" style="${TD};text-align:center;color:#94a3b8;font-style:italic;">No fuel data for selected period</td></tr>`;

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

      <!-- Operations Summary heading -->
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding-bottom:6px;border-bottom:2px solid #1e293b;margin-bottom:14px;">
        Operations Summary
      </div>

      <!-- Stats row 1 (4 cards) -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
        <tr>
          ${statCard("Total Routes", s.total_routes)}
          ${statCard("Total Schedules", s.total_schedules)}
          ${statCard("Completed Trips", s.completed_schedules)}
          ${statCard("Completion Rate", completionRate + "%")}
        </tr>
      </table>

      <!-- Stats row 2 (4 cards) -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
        <tr>
          ${statCard("Active Schedules", s.active_schedules)}
          ${statCard("Delayed", s.delayed_schedules)}
          ${statCard("Emergency", s.emergency_schedules)}
          ${statCard("Total Fuel Cost", "$" + s.total_fuel_cost.toFixed(2))}
        </tr>
      </table>

      <!-- Stats row 3 (2 wide cards) -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr>
          <td style="padding:6px;width:50%;">
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 14px;">
              <div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px;">Total Maintenance Cost</div>
              <div style="font-size:20px;font-weight:700;color:#1e293b;">$${s.total_maintenance_cost.toFixed(2)}</div>
            </div>
          </td>
          <td style="padding:6px;width:50%;">
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 14px;">
              <div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px;">Total Operating Cost</div>
              <div style="font-size:20px;font-weight:700;color:#1e293b;">$${(s.total_fuel_cost + s.total_maintenance_cost).toFixed(2)}</div>
            </div>
          </td>
        </tr>
      </table>

      <!-- Route Performance -->
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding-bottom:6px;border-bottom:2px solid #1e293b;margin-bottom:14px;">
        Route Performance
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">
        <thead>
          <tr>
            <th style="${TH}">Route Code</th>
            <th style="${TH}">Route Name</th>
            <th style="${TH};text-align:center;">Total Trips</th>
            <th style="${TH};text-align:center;">Completed</th>
            <th style="${TH};text-align:center;">Delayed</th>
            <th style="${TH};text-align:center;">Emergency</th>
          </tr>
        </thead>
        <tbody>${routeRows}</tbody>
      </table>

      <!-- Fuel & Maintenance side by side -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr>
          <!-- Fuel Consumption -->
          <td style="vertical-align:top;width:50%;padding-right:12px;">
            <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding-bottom:6px;border-bottom:2px solid #1e293b;margin-bottom:14px;">
              Fuel Consumption
            </div>
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              <thead>
                <tr>
                  <th style="${TH}">Vehicle</th>
                  <th style="${TH};text-align:center;">Logs</th>
                  <th style="${TH};text-align:right;">Liters</th>
                  <th style="${TH};text-align:right;">Cost</th>
                </tr>
              </thead>
              <tbody>${fuelRows}</tbody>
            </table>
          </td>
          <!-- Maintenance Costs -->
          <td style="vertical-align:top;width:50%;padding-left:12px;">
            <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding-bottom:6px;border-bottom:2px solid #1e293b;margin-bottom:14px;">
              Maintenance Costs
            </div>
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
