import { apiRequest } from "./api.js";
import { renderEntityTable, renderFilters, renderInlineError, renderManagementPage, showConfirm, showToast, showLoader, hideLoader } from "./components.js";
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
      <button class="ghost-btn" id="driver-search-btn" type="button">Filter</button>
    `),
    formTitle: "Driver",
    formMarkup: `
      <div class="form-mode-label">
        <span id="form-mode-text">Add Driver</span>
        <span class="edit-badge" id="edit-badge" style="display:none">Editing</span>
      </div>
      <form id="driver-form" class="form-grid compact-form">
        <div class="split-grid">
          <div class="field"><label>Employee No</label><input name="employee_no" required></div>
          <div class="field"><label>Full Name</label><input name="full_name" required></div>
        </div>
        <div class="split-grid">
          <div class="field"><label>License No</label><input name="license_no" required></div>
          <div class="field"><label>Phone</label><input name="phone_number" required></div>
        </div>
        <div class="split-grid">
          <div class="field"><label>Experience (yrs)</label><input name="years_of_experience" type="number" required></div>
          <div class="field"><label>Working Hours</label><input name="working_hours" type="number" step="0.1" required></div>
        </div>
        <div class="field"><label>Hire Date</label><input name="hire_date" type="date" required></div>
        <div class="field" id="status-field" style="display:none">
          <label>Status</label>
          <select name="status">
            <option value="available">Available</option>
            <option value="assigned">Assigned</option>
            <option value="on_leave">On Leave</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        ${renderInlineError("driver-form-error")}
        <div class="form-actions">
          <button class="primary-btn" type="submit" id="driver-submit-btn">Add Driver</button>
          <button class="ghost-btn" type="button" id="driver-cancel-btn" style="display:none">Cancel</button>
        </div>
      </form>
    `,
    tableTitle: "Drivers",
    tableMarkup: renderEntityTable({
      columns: ["Employee", "Name", "License", "Hours", "Status", "Actions"],
      rows: drivers.map((d) => `
        <tr>
          <td>${d.employee_no}</td>
          <td>${d.full_name}</td>
          <td>${d.license_no}</td>
          <td>${d.working_hours}</td>
          <td><span class="badge ${d.status}">${d.status}</span></td>
          <td style="display:flex;gap:6px">
            <button class="table-btn" data-driver-edit="${d.id}">Edit</button>
            <button class="table-btn danger-btn" data-driver-delete="${d.id}" data-driver-name="${d.full_name}">Delete</button>
          </td>
        </tr>
      `),
      emptyMessage: "No drivers available yet.",
    }),
  });

  document.getElementById("logout-btn").addEventListener("click", () => logout(_token));
  document.getElementById("driver-form").addEventListener("submit", submitDriverForm);
  document.getElementById("driver-search-btn").addEventListener("click", applyDriverSearch);
  document.getElementById("driver-cancel-btn").addEventListener("click", resetForm);

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
    editingId = id;
    const form = document.getElementById("driver-form");
    form.employee_no.value = driver.employee_no;
    form.full_name.value = driver.full_name;
    form.license_no.value = driver.license_no;
    form.phone_number.value = driver.phone_number;
    form.years_of_experience.value = driver.years_of_experience;
    form.working_hours.value = driver.working_hours;
    form.hire_date.value = driver.hire_date ? driver.hire_date.slice(0, 10) : "";
    form.status.value = driver.status;
    document.getElementById("form-mode-text").textContent = "Edit Driver";
    document.getElementById("edit-badge").style.display = "";
    document.getElementById("driver-submit-btn").textContent = "Save Changes";
    document.getElementById("driver-cancel-btn").style.display = "";
    document.getElementById("status-field").style.display = "";
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch {
    showToast("Could not load driver data.", "error");
  } finally {
    hideLoader();
  }
}

function resetForm() {
  editingId = null;
  document.getElementById("driver-form").reset();
  document.getElementById("form-mode-text").textContent = "Add Driver";
  document.getElementById("edit-badge").style.display = "none";
  document.getElementById("driver-submit-btn").textContent = "Add Driver";
  document.getElementById("driver-cancel-btn").style.display = "none";
  document.getElementById("status-field").style.display = "none";
  document.getElementById("driver-form-error").textContent = "";
}

async function submitDriverForm(event) {
  event.preventDefault();
  const errorNode = document.getElementById("driver-form-error");
  errorNode.textContent = "";
  const formData = new FormData(event.currentTarget);
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

async function applyDriverSearch() {
  const search = document.getElementById("driver-search").value.trim();
  showLoader("Filtering Drivers…");
  try {
    const user = await fetchCurrentUser(_token);
    const drivers = await apiRequest(search ? `/drivers?search=${encodeURIComponent(search)}` : "/drivers", { headers: authHeaders(_token) });
    render(user, drivers);
  } finally {
    hideLoader();
  }
}
