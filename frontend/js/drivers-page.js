import { apiRequest } from "./api.js";
import { renderEntityTable, renderFilters, renderInlineError, renderManagementPage, showConfirm, showToast, showLoader, hideLoader, openSidePanel, closeSidePanel } from "./components.js";
import { authHeaders, fetchCurrentUser, logout } from "./page-utils.js";

let _container, _token, _role;
let editingId = null;

const isAdmin = () => _role === "admin";

export async function mount(container, token) {
  _container = container;
  _token = token;
  _role = null;
  editingId = null;
  await loadPage();
}

async function loadPage() {
  showLoader("Loading Drivers…");
  try {
    const user = await fetchCurrentUser(_token);
    _role = user.role;
    const drivers = await apiRequest("/drivers", { headers: authHeaders(_token) });
    render(user, drivers);
  } finally {
    hideLoader();
  }
}

function render(user, drivers) {
  _container.innerHTML = renderManagementPage({
    user,
    activeNav: "drivers",
    title: "Driver Management",
    subtitle: "Manage workforce readiness, assignments, and operational coverage.",
    statsCards: [
      { label: "Total Drivers", value: drivers.length },
      { label: "Available", value: drivers.filter((d) => d.status === "available").length },
      { label: "Assigned", value: drivers.filter((d) => d.status === "assigned").length },
      { label: "On Leave", value: drivers.filter((d) => d.status === "on_leave").length },
      { label: "Active Staff", value: drivers.filter((d) => d.active).length },
    ],
    filterMarkup: renderFilters(`
      <input class="filter-input" id="driver-search" placeholder="Search name or employee number">
      <button class="ghost-btn" id="driver-search-btn" type="button">Search</button>
      ${isAdmin() ? `<button class="primary-btn" id="create-driver-btn" type="button">+ New Driver</button>` : ""}
    `),
    tableTitle: "Drivers",
    tableMarkup: renderEntityTable({
      columns: ["Employee No.", "Name", "License", "Hours", "Status", "Actions"],
      rows: drivers.map((d) => `
        <tr>
          <td>${d.employee_no}</td>
          <td>${d.full_name}</td>
          <td>${d.license_no}</td>
          <td>${d.working_hours} hrs</td>
          <td><span class="badge ${d.status}">${d.status.replace("_", " ")}</span></td>
          <td>${isAdmin() ? `<div class="table-actions">
            <button class="table-btn" data-driver-edit="${d.id}">Edit</button>
            <button class="table-btn danger-btn" data-driver-delete="${d.id}" data-driver-name="${d.full_name}">Delete</button>
          </div>` : ""}</td>
        </tr>
      `),
      emptyMessage: "No drivers yet. Click + New Driver to add one.",
    }),
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
          <label>Phone</label>
          <input name="phone_number" placeholder="e.g. 077-1234567" required>
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
      <div class="field">
        <label>Hire Date</label>
        <input name="hire_date" type="date" required>
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
          <label>Phone</label>
          <input name="phone_number" value="${v("phone_number")}" required>
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
        <label>Hire Date</label>
        <input name="hire_date" type="date" value="${v("hire_date") ? String(v("hire_date")).slice(0, 10) : ""}" required>
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
    // Step 1: create the login account
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

    // Step 2: create the driver record
    showLoader("Creating Driver Record…");
    await apiRequest("/drivers", {
      method: "POST",
      headers: authHeaders(_token),
      body: JSON.stringify({
        employee_no: fd.get("employee_no"),
        full_name: fd.get("full_name"),
        license_no: fd.get("license_no"),
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
      // User was created but driver record failed — surface a clear message
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
  const search = document.getElementById("driver-search").value.trim();
  showLoader("Searching…");
  try {
    const user = await fetchCurrentUser(_token);
    const drivers = await apiRequest(search ? `/drivers?search=${encodeURIComponent(search)}` : "/drivers", { headers: authHeaders(_token) });
    render(user, drivers);
  } finally {
    hideLoader();
  }
}
