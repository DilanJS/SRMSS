import { apiRequest } from "./api.js";
import { renderEntityTable, renderFilters, renderInlineError, renderManagementPage, renderPagination, showConfirm, showToast, showLoader, hideLoader, openSidePanel, closeSidePanel } from "./components.js";
import { authHeaders, fetchCurrentUser, logout } from "./page-utils.js";

const PAGE_SIZE = 15;

let _container, _token, _role;
let editingId = null;
let _page = 1, _totalPages = 1, _total = 0, _summary = {};
let _searchQuery = "";

const isAdmin = () => _role === "admin";

export async function mount(container, token) {
  _container = container;
  _token = token;
  _role = null;
  editingId = null;
  _page = 1;
  _searchQuery = "";
  await loadPage();
}

async function loadPage() {
  showLoader("Loading Drivers…");
  try {
    const user = await fetchCurrentUser(_token);
    _role = user.role;
    const params = new URLSearchParams({ page: _page, page_size: PAGE_SIZE });
    if (_searchQuery) params.set("search", _searchQuery);
    const result = await apiRequest(`/drivers?${params}`, { headers: authHeaders(_token) });
    _total = result.total;
    _totalPages = result.total_pages;
    _page = result.page;
    _summary = result.summary;
    render(user, result.items);
  } finally {
    hideLoader();
  }
}

// ── License expiry helpers ────────────────────────────────────────────────────

function licenseExpiryStatus(expiryDate) {
  if (!expiryDate) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const exp = new Date(expiryDate); exp.setHours(0, 0, 0, 0);
  const daysLeft = Math.round((exp - today) / 86400000);
  if (daysLeft < 0)  return { label: "EXPIRED",        daysLeft, cls: "expired" };
  if (daysLeft <= 30) return { label: `${daysLeft}d left`, daysLeft, cls: "expiring" };
  return { label: new Date(expiryDate).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" }), daysLeft, cls: "valid" };
}

function buildLicenseAlertBanner(drivers) {
  const alerts = drivers
    .map((d) => ({ driver: d, status: licenseExpiryStatus(d.license_expiry_date) }))
    .filter(({ status }) => status && status.daysLeft <= 30)
    .sort((a, b) => a.status.daysLeft - b.status.daysLeft);

  if (!alerts.length) return "";
  const rows = alerts.map(({ driver, status }) => {
    const color = status.daysLeft < 0 ? "#dc2626" : status.daysLeft <= 7 ? "#d97706" : "#ca8a04";
    return `<li style="padding:5px 0;border-bottom:1px solid #fde68a;display:flex;justify-content:space-between;">
      <span><strong>${driver.full_name}</strong> (${driver.employee_no}) — License ${driver.license_no}</span>
      <span style="color:${color};font-weight:700;">${status.label}</span>
    </li>`;
  }).join("");
  return `<div class="panel" style="border-left:4px solid #f59e0b;background:#fffbeb;padding:14px 18px;margin-bottom:16px;">
    <strong style="color:#92400e;">License Validity Alerts (${alerts.length})</strong>
    <ul style="list-style:none;padding:0;margin:8px 0 0;">${rows}</ul>
  </div>`;
}

function fmtDate(val) {
  return val ? new Date(val).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" }) : "—";
}

// ── Render ────────────────────────────────────────────────────────────────────

function render(user, drivers) {
  const licenseAlertBanner = buildLicenseAlertBanner(drivers);
  const licenseAlertCount = (_summary.expired_licenses ?? 0) + (_summary.expiring_licenses ?? 0);

  _container.innerHTML = renderManagementPage({
    user,
    activeNav: "drivers",
    title: "Driver Management",
    subtitle: "Manage workforce readiness, assignments, and operational coverage.",
    statsCards: [
      { label: "Total Drivers", value: _total },
      { label: "Available", value: _summary.available ?? drivers.filter((d) => d.status === "available").length },
      { label: "Assigned", value: _summary.assigned ?? drivers.filter((d) => d.status === "assigned").length },
      { label: "On Leave", value: drivers.filter((d) => d.status === "on_leave").length },
      { label: "License Alerts", value: licenseAlertCount, highlight: licenseAlertCount > 0 },
    ],
    filterMarkup: renderFilters(`
      <input class="filter-input" id="driver-search" placeholder="Search name or employee number" value="${_searchQuery}">
      <button class="ghost-btn" id="driver-search-btn" type="button">Search</button>
      ${isAdmin() ? `<button class="primary-btn" id="create-driver-btn" type="button">+ New Driver</button>` : ""}
    `),
    tableTitle: "Drivers",
    tableMarkup: `
      ${licenseAlertBanner}
      ${renderEntityTable({
        columns: ["Employee No.", "Name", "License No.", "License Expiry", "Hours", "Status", "Actions"],
        rows: drivers.map((d) => {
          const expiry = licenseExpiryStatus(d.license_expiry_date);
          let expiryCell = "—";
          if (expiry) {
            const color = expiry.cls === "expired" ? "#dc2626" : expiry.cls === "expiring" ? "#d97706" : "#16a34a";
            expiryCell = `<span style="color:${color};font-weight:${expiry.cls !== "valid" ? "700" : "400"}">${expiry.label}</span>`;
          }
          return `
            <tr>
              <td>${d.employee_no}</td>
              <td>${d.full_name}</td>
              <td>${d.license_no}</td>
              <td>${expiryCell}</td>
              <td>${d.working_hours} hrs</td>
              <td><span class="badge ${d.status}">${d.status.replace("_", " ")}</span></td>
              <td><div class="table-actions">
                <button class="table-btn" data-driver-history="${d.id}" data-driver-name="${d.full_name}">History</button>
                ${isAdmin() ? `
                  <button class="table-btn" data-driver-edit="${d.id}">Edit</button>
                  <button class="table-btn danger-btn" data-driver-delete="${d.id}" data-driver-name="${d.full_name}">Delete</button>
                ` : ""}
              </div></td>
            </tr>
          `;
        }),
        emptyMessage: "No drivers yet. Click + New Driver to add one.",
      }) + renderPagination({ page: _page, totalPages: _totalPages, total: _total, pageSize: PAGE_SIZE })}
    `,
  });

  bindActions();
}

// ── Forms ─────────────────────────────────────────────────────────────────────

function buildCreateFormHTML() {
  return `
    <form id="driver-form" class="form-grid">

      <div class="form-section-label">Driver Details</div>

      <div class="split-grid">
        <div class="field">
          <label>Employee No.</label>
          <input name="employee_no" placeholder="e.g. EMP-001" required>
        </div>
        <div class="field">
          <label>Full Name</label>
          <input name="full_name" placeholder="e.g. John Silva" required>
        </div>
      </div>
      <div class="split-grid">
        <div class="field">
          <label>License No.</label>
          <input name="license_no" placeholder="e.g. DL-456789" required>
        </div>
        <div class="field">
          <label>License Expiry Date</label>
          <input name="license_expiry_date" type="date">
        </div>
      </div>
      <div class="split-grid">
        <div class="field">
          <label>Phone</label>
          <input name="phone_number" placeholder="e.g. 077-1234567" required>
        </div>
        <div class="field">
          <label>Hire Date</label>
          <input name="hire_date" type="date" required>
        </div>
      </div>
      <div class="split-grid">
        <div class="field">
          <label>Experience (yrs)</label>
          <input name="years_of_experience" type="number" min="0" required>
        </div>
        <div class="field">
          <label>Working Hours/Day</label>
          <input name="working_hours" type="number" step="0.5" min="0" max="24" required>
        </div>
      </div>

      <div class="form-section-label">Login Account</div>
      <p style="font-size:13px;color:var(--text-soft);margin:0">
        A <strong>driver</strong> account will be created so this driver can log in to view their assigned routes and schedules.
      </p>

      <div class="field">
        <label>Email Address</label>
        <input name="email" type="email" placeholder="e.g. john.silva@depot.local" required>
      </div>
      <div class="field">
        <label>Password</label>
        <input name="password" type="password" minlength="8" maxlength="128" placeholder="Min. 8 characters" required>
      </div>

      ${renderInlineError("driver-form-error")}
    </form>
  `;
}

function buildEditFormHTML(driver) {
  const v = (field) => driver[field] ?? "";
  const sel = (field, val) => v(field) === val ? "selected" : "";
  const expiryVal = driver.license_expiry_date ? String(driver.license_expiry_date).slice(0, 10) : "";
  return `
    <form id="driver-form" class="form-grid">

      <div class="form-section-label">Driver Details</div>

      <div class="split-grid">
        <div class="field">
          <label>Employee No.</label>
          <input name="employee_no" value="${v("employee_no")}" required>
        </div>
        <div class="field">
          <label>Full Name</label>
          <input name="full_name" value="${v("full_name")}" required>
        </div>
      </div>
      <div class="split-grid">
        <div class="field">
          <label>License No.</label>
          <input name="license_no" value="${v("license_no")}" required>
        </div>
        <div class="field">
          <label>License Expiry Date</label>
          <input name="license_expiry_date" type="date" value="${expiryVal}">
        </div>
      </div>
      <div class="split-grid">
        <div class="field">
          <label>Phone</label>
          <input name="phone_number" value="${v("phone_number")}" required>
        </div>
        <div class="field">
          <label>Hire Date</label>
          <input name="hire_date" type="date" value="${v("hire_date") ? String(v("hire_date")).slice(0, 10) : ""}" required>
        </div>
      </div>
      <div class="split-grid">
        <div class="field">
          <label>Experience (yrs)</label>
          <input name="years_of_experience" type="number" min="0" value="${v("years_of_experience")}" required>
        </div>
        <div class="field">
          <label>Working Hours/Day</label>
          <input name="working_hours" type="number" step="0.5" min="0" max="24" value="${v("working_hours")}" required>
        </div>
      </div>
      <div class="field">
        <label>Status</label>
        <select name="status">
          <option value="available" ${sel("status","available")}>Available</option>
          <option value="assigned" ${sel("status","assigned")}>Assigned</option>
          <option value="on_leave" ${sel("status","on_leave")}>On Leave</option>
          <option value="inactive" ${sel("status","inactive")}>Inactive</option>
        </select>
      </div>

      <p style="font-size:13px;color:var(--text-soft);margin:0">
        To update this driver's login credentials, go to <strong>User Management</strong>.
      </p>

      ${renderInlineError("driver-form-error")}
    </form>
  `;
}

// ── Assignment History Panel ──────────────────────────────────────────────────

function buildHistoryPanelHTML(driver) {
  const history = driver.assignment_history || [];
  if (!history.length) {
    return `<p style="color:var(--text-soft);font-style:italic;padding:16px 0;">No assignment history recorded for this driver.</p>`;
  }
  const rows = [...history]
    .sort((a, b) => new Date(b.assigned_at) - new Date(a.assigned_at))
    .map((entry) => `
      <tr>
        <td>${fmtDate(entry.assigned_at)}</td>
        <td>${fmtDate(entry.released_at)}</td>
        <td>${entry.route_id || "—"}</td>
        <td>${entry.vehicle_id || "—"}</td>
        <td>${entry.notes || "—"}</td>
      </tr>
    `).join("");
  return renderEntityTable({
    columns: ["Assigned", "Released", "Route ID", "Vehicle ID", "Notes"],
    rows: [rows],
    emptyMessage: "",
  });
}

function openHistoryPanel(driver) {
  openSidePanel({
    title: "Assignment History",
    subtitle: `${driver.full_name} (${driver.employee_no})`,
    body: buildHistoryPanelHTML(driver),
    footer: `<button class="ghost-btn" type="button" id="history-panel-close">Close</button>`,
  });
  document.getElementById("history-panel-close").addEventListener("click", closeSidePanel);
}

// ── Panel open/close ──────────────────────────────────────────────────────────

function openCreatePanel() {
  editingId = null;
  openSidePanel({
    title: "New Driver",
    subtitle: "Add a driver and create their login account.",
    body: buildCreateFormHTML(),
    footer: `
      <button class="primary-btn" id="driver-panel-submit" type="button">Create Driver</button>
      <button class="ghost-btn" type="button" id="driver-panel-cancel">Cancel</button>
    `,
  });
  document.getElementById("driver-panel-submit").addEventListener("click", submitCreate);
  document.getElementById("driver-panel-cancel").addEventListener("click", closeSidePanel);
}

function openEditPanel(driver) {
  editingId = driver.id;
  openSidePanel({
    title: "Edit Driver",
    subtitle: `Editing ${driver.full_name}`,
    body: buildEditFormHTML(driver),
    footer: `
      <button class="primary-btn" id="driver-panel-submit" type="button">Save Changes</button>
      <button class="ghost-btn" type="button" id="driver-panel-cancel">Cancel</button>
    `,
  });
  document.getElementById("driver-panel-submit").addEventListener("click", submitEdit);
  document.getElementById("driver-panel-cancel").addEventListener("click", closeSidePanel);
}

// ── Submit ────────────────────────────────────────────────────────────────────

async function submitCreate() {
  const errorNode = document.getElementById("driver-form-error");
  errorNode.textContent = "";
  const form = document.getElementById("driver-form");
  if (!form.checkValidity()) { form.reportValidity(); return; }

  const fd = new FormData(form);
  showLoader("Creating Driver Account…");

  let userId = null;
  try {
    const userRes = await apiRequest("/auth/users", {
      method: "POST",
      headers: authHeaders(_token),
      body: JSON.stringify({
        full_name: fd.get("full_name"),
        email: fd.get("email"),
        password: fd.get("password"),
        role: "driver",
      }),
    });
    userId = userRes.id;

    showLoader("Creating Driver Record…");
    await apiRequest("/drivers", {
      method: "POST",
      headers: authHeaders(_token),
      body: JSON.stringify({
        employee_no: fd.get("employee_no"),
        full_name: fd.get("full_name"),
        license_no: fd.get("license_no"),
        license_expiry_date: fd.get("license_expiry_date") || null,
        phone_number: fd.get("phone_number"),
        years_of_experience: Number(fd.get("years_of_experience")),
        working_hours: Number(fd.get("working_hours")),
        hire_date: fd.get("hire_date"),
        status: "available",
        active: true,
        assigned_route_id: null,
        assigned_vehicle_id: null,
        assignment_history: [],
      }),
    });

    showToast("Driver and login account created successfully.");
    closeSidePanel();
    await loadPage();
  } catch (error) {
    hideLoader();
    if (userId) {
      errorNode.textContent = `Login account created but driver record failed: ${error.message}. Please delete the orphan user in User Management and try again.`;
    } else {
      errorNode.textContent = error.message;
    }
  }
}

async function submitEdit() {
  const errorNode = document.getElementById("driver-form-error");
  errorNode.textContent = "";
  const form = document.getElementById("driver-form");
  if (!form.checkValidity()) { form.reportValidity(); return; }

  const fd = new FormData(form);
  showLoader("Updating Driver…");
  try {
    await apiRequest(`/drivers/${editingId}`, {
      method: "PUT",
      headers: authHeaders(_token),
      body: JSON.stringify({
        employee_no: fd.get("employee_no"),
        full_name: fd.get("full_name"),
        license_no: fd.get("license_no"),
        license_expiry_date: fd.get("license_expiry_date") || null,
        phone_number: fd.get("phone_number"),
        years_of_experience: Number(fd.get("years_of_experience")),
        working_hours: Number(fd.get("working_hours")),
        hire_date: fd.get("hire_date"),
        status: fd.get("status"),
      }),
    });
    showToast("Driver updated successfully.");
    closeSidePanel();
    await loadPage();
  } catch (error) {
    hideLoader();
    errorNode.textContent = error.message;
  }
}

// ── Bind ──────────────────────────────────────────────────────────────────────

function bindActions() {
  document.getElementById("logout-btn").addEventListener("click", () => logout(_token));
  document.getElementById("create-driver-btn")?.addEventListener("click", openCreatePanel);
  document.getElementById("driver-search-btn").addEventListener("click", applySearch);

  document.querySelectorAll("[data-driver-history]").forEach((btn) => {
    btn.addEventListener("click", () => startHistory(btn.dataset.driverHistory, btn.dataset.driverName));
  });

  document.querySelectorAll("[data-driver-edit]").forEach((btn) => {
    btn.addEventListener("click", () => startEdit(btn.dataset.driverEdit));
  });

  document.querySelectorAll("[data-driver-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      showConfirm({
        title: "Delete Driver",
        message: `Remove driver <strong>${btn.dataset.driverName}</strong>? This cannot be undone. Their login account will remain — delete it separately in User Management if needed.`,
        onConfirm: () => deleteDriver(btn.dataset.driverDelete),
      });
    });
  });

  document.querySelectorAll(".pagination [data-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      _page = parseInt(btn.dataset.page);
      loadPage();
    });
  });
}

async function startHistory(id) {
  showLoader("Loading History…");
  try {
    const driver = await apiRequest(`/drivers/${id}`, { headers: authHeaders(_token) });
    openHistoryPanel(driver);
  } catch {
    showToast("Could not load driver history.", "error");
  } finally {
    hideLoader();
  }
}

async function startEdit(id) {
  showLoader("Loading Driver…");
  try {
    const driver = await apiRequest(`/drivers/${id}`, { headers: authHeaders(_token) });
    openEditPanel(driver);
  } catch {
    showToast("Could not load driver data.", "error");
  } finally {
    hideLoader();
  }
}

async function deleteDriver(id) {
  showLoader("Removing Driver…");
  try {
    await apiRequest(`/drivers/${id}`, { method: "DELETE", headers: authHeaders(_token) });
    showToast("Driver removed. Remember to delete their user account in User Management if needed.", "info");
    await loadPage();
  } catch (e) {
    hideLoader();
    showToast(e.message, "error");
  }
}

async function applySearch() {
  _searchQuery = document.getElementById("driver-search").value.trim();
  _page = 1;
  await loadPage();
}
