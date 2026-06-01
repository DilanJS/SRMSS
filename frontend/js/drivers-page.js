import { apiRequest } from "./api.js";
import { renderEntityTable, renderFilters, renderInlineError, renderManagementPage, showConfirm, showToast, showLoader, hideLoader, openSidePanel, closeSidePanel } from "./components.js";
import { authHeaders, fetchCurrentUser, logout } from "./page-utils.js";

let _container, _token;
let editingId = null;

export async function mount(container, token) {
  _container = container;
  _token = token;
  editingId = null;
  await loadPage();
}

async function loadPage() {
  showLoader("Loading Drivers…");
  try {
    const user = await fetchCurrentUser(_token);
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
      <button class="primary-btn" id="create-driver-btn" type="button">+ New Driver</button>
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
          <td><div class="table-actions">
            <button class="table-btn" data-driver-edit="${d.id}">Edit</button>
            <button class="table-btn danger-btn" data-driver-delete="${d.id}" data-driver-name="${d.full_name}">Delete</button>
          </div></td>
        </tr>
      `),
      emptyMessage: "No drivers yet. Click + New Driver to add one.",
    }),
  });

  bindActions();
}

function buildFormHTML(driver = null) {
  const v = (field) => driver ? (driver[field] ?? "") : "";
  const sel = (field, val) => v(field) === val ? "selected" : "";
  return `
    <form id="driver-form" class="form-grid">
      <div class="split-grid">
        <div class="field">
          <label>Employee No.</label>
          <input name="employee_no" value="${v("employee_no")}" placeholder="e.g. EMP-001" required>
        </div>
        <div class="field">
          <label>Full Name</label>
          <input name="full_name" value="${v("full_name")}" placeholder="e.g. John Silva" required>
        </div>
      </div>
      <div class="split-grid">
        <div class="field">
          <label>License No.</label>
          <input name="license_no" value="${v("license_no")}" placeholder="e.g. DL-456789" required>
        </div>
        <div class="field">
          <label>Phone</label>
          <input name="phone_number" value="${v("phone_number")}" placeholder="e.g. 077-1234567" required>
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
      ${driver ? `
        <div class="field">
          <label>Status</label>
          <select name="status">
            <option value="available" ${sel("status","available")}>Available</option>
            <option value="assigned" ${sel("status","assigned")}>Assigned</option>
            <option value="on_leave" ${sel("status","on_leave")}>On Leave</option>
            <option value="inactive" ${sel("status","inactive")}>Inactive</option>
          </select>
        </div>
      ` : ""}
      ${renderInlineError("driver-form-error")}
    </form>
  `;
}

function openDriverPanel(driver = null) {
  editingId = driver?.id || null;
  openSidePanel({
    title: driver ? "Edit Driver" : "New Driver",
    subtitle: driver ? `Editing ${driver.full_name}` : "Add a new driver to the workforce.",
    body: buildFormHTML(driver),
    footer: `
      <button class="primary-btn" id="driver-panel-submit" type="button">${driver ? "Save Changes" : "Add Driver"}</button>
      <button class="ghost-btn" type="button" id="driver-panel-cancel">Cancel</button>
    `,
  });
  document.getElementById("driver-panel-submit").addEventListener("click", submitDriverForm);
  document.getElementById("driver-panel-cancel").addEventListener("click", closeSidePanel);
}

function bindActions() {
  document.getElementById("logout-btn").addEventListener("click", () => logout(_token));
  document.getElementById("create-driver-btn").addEventListener("click", () => openDriverPanel());
  document.getElementById("driver-search-btn").addEventListener("click", applySearch);

  document.querySelectorAll("[data-driver-edit]").forEach((btn) => {
    btn.addEventListener("click", () => startEdit(btn.dataset.driverEdit));
  });

  document.querySelectorAll("[data-driver-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      showConfirm({
        title: "Delete Driver",
        message: `Remove driver <strong>${btn.dataset.driverName}</strong>? This cannot be undone.`,
        onConfirm: () => deleteDriver(btn.dataset.driverDelete),
      });
    });
  });
}

async function startEdit(id) {
  showLoader("Loading Driver…");
  try {
    const driver = await apiRequest(`/drivers/${id}`, { headers: authHeaders(_token) });
    openDriverPanel(driver);
  } catch {
    showToast("Could not load driver data.", "error");
  } finally {
    hideLoader();
  }
}

async function submitDriverForm() {
  const errorNode = document.getElementById("driver-form-error");
  errorNode.textContent = "";
  const form = document.getElementById("driver-form");
  if (!form.checkValidity()) { form.reportValidity(); return; }

  const formData = new FormData(form);
  const payload = {
    employee_no: formData.get("employee_no"),
    full_name: formData.get("full_name"),
    license_no: formData.get("license_no"),
    phone_number: formData.get("phone_number"),
    years_of_experience: Number(formData.get("years_of_experience")),
    working_hours: Number(formData.get("working_hours")),
    hire_date: formData.get("hire_date"),
  };

  showLoader(editingId ? "Updating Driver…" : "Adding Driver…");
  try {
    if (editingId) {
      payload.status = formData.get("status");
      await apiRequest(`/drivers/${editingId}`, { method: "PUT", headers: authHeaders(_token), body: JSON.stringify(payload) });
      showToast("Driver updated successfully.");
    } else {
      payload.status = "available";
      payload.active = true;
      payload.assigned_route_id = null;
      payload.assigned_vehicle_id = null;
      payload.assignment_history = [];
      await apiRequest("/drivers", { method: "POST", headers: authHeaders(_token), body: JSON.stringify(payload) });
      showToast("Driver added successfully.");
    }
    closeSidePanel();
    await loadPage();
  } catch (error) {
    hideLoader();
    errorNode.textContent = error.message;
  }
}

async function deleteDriver(id) {
  showLoader("Removing Driver…");
  try {
    await apiRequest(`/drivers/${id}`, { method: "DELETE", headers: authHeaders(_token) });
    showToast("Driver removed.", "info");
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
