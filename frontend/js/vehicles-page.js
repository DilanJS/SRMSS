import { apiRequest } from "./api.js";
import { renderEntityTable, renderFilters, renderInlineError, renderManagementPage, renderPagination, showConfirm, showToast, showLoader, hideLoader, openSidePanel, closeSidePanel } from "./components.js";
import { authHeaders, fetchCurrentUser, logout } from "./page-utils.js";

const PAGE_SIZE = 15;
const fmtDate = (val) => val ? new Date(val).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" }) : "—";

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
  showLoader("Loading Vehicles…");
  try {
    const user = await fetchCurrentUser(_token);
    _role = user.role;
    const params = new URLSearchParams({ page: _page, page_size: PAGE_SIZE });
    if (_searchQuery) params.set("search", _searchQuery);
    const result = await apiRequest(`/vehicles?${params}`, { headers: authHeaders(_token) });
    _total = result.total;
    _totalPages = result.total_pages;
    _page = result.page;
    _summary = result.summary;
    render(user, result.items);
  } finally {
    hideLoader();
  }
}

function render(user, vehicles) {
  _container.innerHTML = renderManagementPage({
    user,
    activeNav: "vehicles",
    title: "Vehicle Management",
    subtitle: "Track fleet readiness, availability, and operating capacity.",
    statsCards: [
      { label: "Total Vehicles", value: _total },
      { label: "Available", value: _summary.available ?? 0 },
      { label: "Assigned", value: _summary.assigned ?? 0 },
      { label: "Maintenance", value: _summary.maintenance ?? 0 },
      { label: "Active Fleet", value: _summary.active_fleet ?? 0 },
    ],
    filterMarkup: renderFilters(`
      <input class="filter-input" id="vehicle-search" placeholder="Search registration or model" value="${_searchQuery}">
      <button class="ghost-btn" id="vehicle-search-btn" type="button">Search</button>
      ${isAdmin() ? `<button class="primary-btn" id="create-vehicle-btn" type="button">+ New Vehicle</button>` : ""}
    `),
    tableTitle: "Fleet",
    tableMarkup: renderEntityTable({
      columns: ["Registration", "Model", "Fuel", "Capacity", "Mileage", "Status", "Actions"],
      rows: vehicles.map((v) => `
        <tr>
          <td>${v.registration_no}</td>
          <td>${v.manufacturer} ${v.model}</td>
          <td>${v.fuel_type}</td>
          <td>${v.capacity}</td>
          <td>${v.mileage_km.toLocaleString()} km</td>
          <td><span class="badge ${v.status}">${v.status}</span></td>
          <td><div class="table-actions">
            <button class="table-btn" data-vehicle-maint="${v.id}" data-vehicle-reg="${v.registration_no}">Maint. History</button>
            ${isAdmin() ? `
              <button class="table-btn" data-vehicle-edit="${v.id}">Edit</button>
              <button class="table-btn danger-btn" data-vehicle-delete="${v.id}" data-vehicle-reg="${v.registration_no}">Delete</button>
            ` : ""}
          </div></td>
        </tr>
      `),
      emptyMessage: "No vehicles yet. Click + New Vehicle to add one.",
    }) + renderPagination({ page: _page, totalPages: _totalPages, total: _total, pageSize: PAGE_SIZE }),
  });

  bindActions();
}

function buildFormHTML(vehicle = null) {
  const v = (field) => vehicle ? (vehicle[field] ?? "") : "";
  const sel = (field, val) => v(field) === val ? "selected" : "";
  return `
    <form id="vehicle-form" class="form-grid">
      <div class="split-grid">
        <div class="field">
          <label>Registration No.</label>
          <input name="registration_no" value="${v("registration_no")}" placeholder="e.g. NB-1234" required>
        </div>
        <div class="field">
          <label>Fleet Number</label>
          <input name="fleet_number" value="${v("fleet_number")}" placeholder="e.g. FL-042" required>
        </div>
      </div>
      <div class="split-grid">
        <div class="field">
          <label>Manufacturer</label>
          <input name="manufacturer" value="${v("manufacturer")}" placeholder="e.g. Tata" required>
        </div>
        <div class="field">
          <label>Model</label>
          <input name="model" value="${v("model")}" placeholder="e.g. Starbus" required>
        </div>
      </div>
      <div class="split-grid">
        <div class="field">
          <label>Capacity (seats)</label>
          <input name="capacity" type="number" min="1" value="${v("capacity")}" required>
        </div>
        <div class="field">
          <label>Mileage (km)</label>
          <input name="mileage_km" type="number" step="0.1" min="0" value="${v("mileage_km")}" required>
        </div>
      </div>
      <div class="field">
        <label>Fuel Type</label>
        <select name="fuel_type">
          <option value="diesel" ${sel("fuel_type","diesel")}>Diesel</option>
          <option value="petrol" ${sel("fuel_type","petrol")}>Petrol</option>
          <option value="electric" ${sel("fuel_type","electric")}>Electric</option>
          <option value="hybrid" ${sel("fuel_type","hybrid")}>Hybrid</option>
          <option value="cng" ${sel("fuel_type","cng")}>CNG</option>
        </select>
      </div>
      ${vehicle ? `
        <div class="field">
          <label>Status</label>
          <select name="status">
            <option value="available" ${sel("status","available")}>Available</option>
            <option value="assigned" ${sel("status","assigned")}>Assigned</option>
            <option value="maintenance" ${sel("status","maintenance")}>Maintenance</option>
            <option value="inactive" ${sel("status","inactive")}>Inactive</option>
          </select>
        </div>
      ` : ""}
      ${renderInlineError("vehicle-form-error")}
    </form>
  `;
}

async function openMaintenanceHistory(vehicleId, registrationNo) {
  showLoader("Loading Maintenance History…");
  try {
    const result = await apiRequest(`/maintenance/maintenance-logs?vehicle_id=${encodeURIComponent(vehicleId)}&page_size=1000`, { headers: authHeaders(_token) });
    const logs = result.items;
    let body;
    if (!logs.length) {
      body = `<p style="color:var(--text-soft);font-style:italic;padding:16px 0;">No maintenance records found for this vehicle.</p>`;
    } else {
      const rows = logs.map((l) => `
        <tr>
          <td>${fmtDate(l.service_date)}</td>
          <td>${l.service_type.replace(/_/g, " ")}</td>
          <td><span class="badge ${l.status}">${l.status.replace(/_/g, " ")}</span></td>
          <td>$${l.cost.toFixed(2)}</td>
          <td>${l.workshop_name || "—"}</td>
          <td>${fmtDate(l.next_due_date)}</td>
        </tr>
      `).join("");
      body = renderEntityTable({
        columns: ["Date", "Service Type", "Status", "Cost", "Workshop", "Next Due"],
        rows: [rows],
        emptyMessage: "",
      });
    }
    openSidePanel({
      title: "Maintenance History",
      subtitle: `Vehicle ${registrationNo}`,
      body,
      footer: `<button class="ghost-btn" type="button" id="maint-history-close">Close</button>`,
    });
    document.getElementById("maint-history-close").addEventListener("click", closeSidePanel);
  } catch {
    showToast("Could not load maintenance history.", "error");
  } finally {
    hideLoader();
  }
}

function openVehiclePanel(vehicle = null) {
  editingId = vehicle?.id || null;
  openSidePanel({
    title: vehicle ? "Edit Vehicle" : "New Vehicle",
    subtitle: vehicle ? `Editing ${vehicle.registration_no}` : "Add a new vehicle to the fleet.",
    body: buildFormHTML(vehicle),
    footer: `
      <button class="primary-btn" id="vehicle-panel-submit" type="button">${vehicle ? "Save Changes" : "Add Vehicle"}</button>
      <button class="ghost-btn" type="button" id="vehicle-panel-cancel">Cancel</button>
    `,
  });
  document.getElementById("vehicle-panel-submit").addEventListener("click", submitVehicleForm);
  document.getElementById("vehicle-panel-cancel").addEventListener("click", closeSidePanel);
}

function bindActions() {
  document.getElementById("logout-btn").addEventListener("click", () => logout(_token));
  document.getElementById("create-vehicle-btn")?.addEventListener("click", () => openVehiclePanel());
  document.getElementById("vehicle-search-btn").addEventListener("click", applySearch);

  document.querySelectorAll("[data-vehicle-maint]").forEach((btn) => {
    btn.addEventListener("click", () => openMaintenanceHistory(btn.dataset.vehicleMaint, btn.dataset.vehicleReg));
  });

  document.querySelectorAll("[data-vehicle-edit]").forEach((btn) => {
    btn.addEventListener("click", () => startEdit(btn.dataset.vehicleEdit));
  });

  document.querySelectorAll("[data-vehicle-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      showConfirm({
        title: "Delete Vehicle",
        message: `Delete vehicle <strong>${btn.dataset.vehicleReg}</strong>? This cannot be undone.`,
        onConfirm: () => deleteVehicle(btn.dataset.vehicleDelete),
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

async function startEdit(id) {
  showLoader("Loading Vehicle…");
  try {
    const vehicle = await apiRequest(`/vehicles/${id}`, { headers: authHeaders(_token) });
    openVehiclePanel(vehicle);
  } catch {
    showToast("Could not load vehicle data.", "error");
  } finally {
    hideLoader();
  }
}

async function submitVehicleForm() {
  const errorNode = document.getElementById("vehicle-form-error");
  errorNode.textContent = "";
  const form = document.getElementById("vehicle-form");
  if (!form.checkValidity()) { form.reportValidity(); return; }

  const formData = new FormData(form);
  const payload = {
    registration_no: formData.get("registration_no"),
    fleet_number: formData.get("fleet_number"),
    manufacturer: formData.get("manufacturer"),
    model: formData.get("model"),
    capacity: Number(formData.get("capacity")),
    mileage_km: Number(formData.get("mileage_km")),
    fuel_type: formData.get("fuel_type"),
  };

  showLoader(editingId ? "Updating Vehicle…" : "Adding Vehicle…");
  try {
    if (editingId) {
      payload.status = formData.get("status");
      await apiRequest(`/vehicles/${editingId}`, { method: "PUT", headers: authHeaders(_token), body: JSON.stringify(payload) });
      showToast("Vehicle updated successfully.");
    } else {
      payload.status = "available";
      payload.active = true;
      await apiRequest("/vehicles", { method: "POST", headers: authHeaders(_token), body: JSON.stringify(payload) });
      showToast("Vehicle added successfully.");
    }
    closeSidePanel();
    await loadPage();
  } catch (error) {
    hideLoader();
    errorNode.textContent = error.message;
  }
}

async function deleteVehicle(id) {
  showLoader("Deleting Vehicle…");
  try {
    await apiRequest(`/vehicles/${id}`, { method: "DELETE", headers: authHeaders(_token) });
    showToast("Vehicle deleted.", "info");
    await loadPage();
  } catch (e) {
    hideLoader();
    showToast(e.message, "error");
  }
}

async function applySearch() {
  _searchQuery = document.getElementById("vehicle-search").value.trim();
  _page = 1;
  await loadPage();
}
