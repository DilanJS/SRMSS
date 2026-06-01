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
  showLoader("Loading Vehicles…");
  try {
    const user = await fetchCurrentUser(_token);
    const vehicles = await apiRequest("/vehicles", { headers: authHeaders(_token) });
    render(user, vehicles);
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
      { label: "Total Vehicles", value: vehicles.length },
      { label: "Available", value: vehicles.filter((v) => v.status === "available").length },
      { label: "Assigned", value: vehicles.filter((v) => v.status === "assigned").length },
      { label: "Maintenance", value: vehicles.filter((v) => v.status === "maintenance").length },
      { label: "Active Fleet", value: vehicles.filter((v) => v.active).length },
    ],
    filterMarkup: renderFilters(`
      <input class="filter-input" id="vehicle-search" placeholder="Search registration or model">
      <button class="ghost-btn" id="vehicle-search-btn" type="button">Filter</button>
    `),
    formTitle: "Vehicle",
    formMarkup: `
      <div class="form-mode-label">
        <span id="form-mode-text">Add Vehicle</span>
        <span class="edit-badge" id="edit-badge" style="display:none">Editing</span>
      </div>
      <form id="vehicle-form" class="form-grid compact-form">
        <div class="split-grid">
          <div class="field"><label>Registration</label><input name="registration_no" required></div>
          <div class="field"><label>Fleet Number</label><input name="fleet_number" required></div>
        </div>
        <div class="split-grid">
          <div class="field"><label>Model</label><input name="model" required></div>
          <div class="field"><label>Manufacturer</label><input name="manufacturer" required></div>
        </div>
        <div class="split-grid">
          <div class="field"><label>Capacity</label><input name="capacity" type="number" required></div>
          <div class="field"><label>Mileage KM</label><input name="mileage_km" type="number" step="0.1" required></div>
        </div>
        <div class="field">
          <label>Fuel Type</label>
          <select name="fuel_type">
            <option value="diesel">Diesel</option>
            <option value="petrol">Petrol</option>
            <option value="electric">Electric</option>
            <option value="hybrid">Hybrid</option>
            <option value="cng">CNG</option>
          </select>
        </div>
        <div class="field" id="status-field" style="display:none">
          <label>Status</label>
          <select name="status">
            <option value="available">Available</option>
            <option value="assigned">Assigned</option>
            <option value="maintenance">Maintenance</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        ${renderInlineError("vehicle-form-error")}
        <div class="form-actions">
          <button class="primary-btn" type="submit" id="vehicle-submit-btn">Add Vehicle</button>
          <button class="ghost-btn" type="button" id="vehicle-cancel-btn" style="display:none">Cancel</button>
        </div>
      </form>
    `,
    tableTitle: "Fleet",
    tableMarkup: renderEntityTable({
      columns: ["Registration", "Model", "Fuel", "Capacity", "Status", "Actions"],
      rows: vehicles.map((v) => `
        <tr>
          <td>${v.registration_no}</td>
          <td>${v.manufacturer} ${v.model}</td>
          <td>${v.fuel_type}</td>
          <td>${v.capacity}</td>
          <td><span class="badge ${v.status}">${v.status}</span></td>
          <td style="display:flex;gap:6px">
            <button class="table-btn" data-vehicle-edit="${v.id}">Edit</button>
            <button class="table-btn danger-btn" data-vehicle-delete="${v.id}" data-vehicle-reg="${v.registration_no}">Delete</button>
          </td>
        </tr>
      `),
      emptyMessage: "No vehicles available yet.",
    }),
  });

  document.getElementById("logout-btn").addEventListener("click", () => logout(_token));
  document.getElementById("vehicle-form").addEventListener("submit", submitVehicleForm);
  document.getElementById("vehicle-search-btn").addEventListener("click", applyVehicleSearch);
  document.getElementById("vehicle-cancel-btn").addEventListener("click", resetForm);

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
}

async function startEdit(id) {
  showLoader("Loading Vehicle…");
  try {
    const vehicle = await apiRequest(`/vehicles/${id}`, { headers: authHeaders(_token) });
    editingId = id;
    const form = document.getElementById("vehicle-form");
    form.registration_no.value = vehicle.registration_no;
    form.fleet_number.value = vehicle.fleet_number;
    form.model.value = vehicle.model;
    form.manufacturer.value = vehicle.manufacturer;
    form.capacity.value = vehicle.capacity;
    form.mileage_km.value = vehicle.mileage_km;
    form.fuel_type.value = vehicle.fuel_type;
    form.status.value = vehicle.status;
    document.getElementById("form-mode-text").textContent = "Edit Vehicle";
    document.getElementById("edit-badge").style.display = "";
    document.getElementById("vehicle-submit-btn").textContent = "Save Changes";
    document.getElementById("vehicle-cancel-btn").style.display = "";
    document.getElementById("status-field").style.display = "";
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch {
    showToast("Could not load vehicle data.", "error");
  } finally {
    hideLoader();
  }
}

function resetForm() {
  editingId = null;
  document.getElementById("vehicle-form").reset();
  document.getElementById("form-mode-text").textContent = "Add Vehicle";
  document.getElementById("edit-badge").style.display = "none";
  document.getElementById("vehicle-submit-btn").textContent = "Add Vehicle";
  document.getElementById("vehicle-cancel-btn").style.display = "none";
  document.getElementById("status-field").style.display = "none";
  document.getElementById("vehicle-form-error").textContent = "";
}

async function submitVehicleForm(event) {
  event.preventDefault();
  const errorNode = document.getElementById("vehicle-form-error");
  errorNode.textContent = "";
  const formData = new FormData(event.currentTarget);
  const payload = {
    registration_no: formData.get("registration_no"),
    fleet_number: formData.get("fleet_number"),
    model: formData.get("model"),
    manufacturer: formData.get("manufacturer"),
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

async function applyVehicleSearch() {
  const search = document.getElementById("vehicle-search").value.trim();
  showLoader("Filtering Vehicles…");
  try {
    const user = await fetchCurrentUser(_token);
    const vehicles = await apiRequest(search ? `/vehicles?search=${encodeURIComponent(search)}` : "/vehicles", { headers: authHeaders(_token) });
    render(user, vehicles);
  } finally {
    hideLoader();
  }
}
