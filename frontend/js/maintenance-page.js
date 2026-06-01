import { apiRequest } from "./api.js";
import { renderEntityTable, renderFilters, renderInlineError, renderShellLayout, showToast, showLoader, hideLoader } from "./components.js";
import { authHeaders, fetchCurrentUser, logout } from "./page-utils.js";

let _container, _token;
let vehicles = [];
let activeTab = "fuel";
let editingMaintenanceId = null;

export async function mount(container, token) {
  _container = container;
  _token = token;
  editingMaintenanceId = null;
  activeTab = "fuel";
  await loadPage();
}

async function loadPage() {
  showLoader("Loading Maintenance…");
  try {
    const [user, vList, fuelLogs, maintenanceLogs] = await Promise.all([
      fetchCurrentUser(_token),
      apiRequest("/vehicles", { headers: authHeaders(_token) }),
      apiRequest("/maintenance/fuel-logs", { headers: authHeaders(_token) }),
      apiRequest("/maintenance/maintenance-logs", { headers: authHeaders(_token) }),
    ]);
    vehicles = vList;
    render(user, fuelLogs, maintenanceLogs);
  } finally {
    hideLoader();
  }
}

function vehicleName(id) {
  const v = vehicles.find((x) => x.id === id);
  return v ? `${v.registration_no} (${v.model})` : id;
}

function vehicleOptions(selected = "") {
  return vehicles.map((v) =>
    `<option value="${v.id}" ${v.id === selected ? "selected" : ""}>${v.registration_no} – ${v.manufacturer} ${v.model}</option>`
  ).join("");
}

function fmt(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

function render(user, fuelLogs, maintenanceLogs) {
  const totalFuelCost = fuelLogs.reduce((s, l) => s + l.cost, 0).toFixed(2);
  const totalMaintenanceCost = maintenanceLogs.reduce((s, l) => s + l.cost, 0).toFixed(2);
  const pendingMaintenance = maintenanceLogs.filter((l) => l.status === "scheduled" || l.status === "in_progress").length;

  _container.innerHTML = renderShellLayout({
    user,
    activeNav: "maintenance",
    title: "Fuel & Maintenance",
    subtitle: "Track fuel consumption and manage vehicle maintenance schedules.",
    content: `
      <section class="dashboard-grid">
        <div class="stats-grid">
          <article class="stat-card"><span>Fuel Logs</span><strong>${fuelLogs.length}</strong></article>
          <article class="stat-card"><span>Total Fuel Cost</span><strong>$${totalFuelCost}</strong></article>
          <article class="stat-card"><span>Maintenance Logs</span><strong>${maintenanceLogs.length}</strong></article>
          <article class="stat-card"><span>Pending Service</span><strong>${pendingMaintenance}</strong></article>
          <article class="stat-card"><span>Total Maint. Cost</span><strong>$${totalMaintenanceCost}</strong></article>
        </div>
        <div class="management-grid">
          <section class="panel">
            <div class="tab-bar">
              <button class="tab-btn ${activeTab === "fuel" ? "active" : ""}" id="tab-fuel">Fuel Logs</button>
              <button class="tab-btn ${activeTab === "maintenance" ? "active" : ""}" id="tab-maintenance">Maintenance Logs</button>
            </div>
            <div id="fuel-tab" ${activeTab !== "fuel" ? 'style="display:none"' : ""}>
              ${renderFilters(`
                <select class="filter-input" id="fuel-vehicle-filter" style="max-width:220px">
                  <option value="">All Vehicles</option>
                  ${vehicleOptions()}
                </select>
                <button class="ghost-btn" id="fuel-filter-btn">Filter</button>
              `)}
              ${renderEntityTable({
                columns: ["Vehicle", "Date", "Liters", "Cost", "Odometer", "Station"],
                rows: fuelLogs.map((l) => `
                  <tr>
                    <td>${vehicleName(l.vehicle_id)}</td>
                    <td>${fmt(l.filled_at)}</td>
                    <td>${l.liters} L</td>
                    <td>$${l.cost.toFixed(2)}</td>
                    <td>${l.odometer_km.toLocaleString()} km</td>
                    <td>${l.station_name || "—"}</td>
                  </tr>
                `),
                emptyMessage: "No fuel logs recorded yet.",
              })}
            </div>
            <div id="maintenance-tab" ${activeTab !== "maintenance" ? 'style="display:none"' : ""}>
              ${renderFilters(`
                <select class="filter-input" id="maint-vehicle-filter" style="max-width:200px">
                  <option value="">All Vehicles</option>
                  ${vehicleOptions()}
                </select>
                <select class="filter-input" id="maint-status-filter" style="max-width:160px">
                  <option value="">All Statuses</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <button class="ghost-btn" id="maint-filter-btn">Filter</button>
              `)}
              ${renderEntityTable({
                columns: ["Vehicle", "Service Type", "Date", "Status", "Cost", "Workshop", "Actions"],
                rows: maintenanceLogs.map((l) => `
                  <tr>
                    <td>${vehicleName(l.vehicle_id)}</td>
                    <td>${l.service_type.replace(/_/g, " ")}</td>
                    <td>${fmt(l.service_date)}</td>
                    <td><span class="badge ${l.status}">${l.status.replace(/_/g, " ")}</span></td>
                    <td>$${l.cost.toFixed(2)}</td>
                    <td>${l.workshop_name || "—"}</td>
                    <td><button class="table-btn" data-maint-edit="${l.id}">Edit</button></td>
                  </tr>
                `),
                emptyMessage: "No maintenance logs recorded yet.",
              })}
            </div>
          </section>
          <section class="panel">
            <div class="tab-bar">
              <button class="tab-btn ${activeTab === "fuel" ? "active" : ""}" id="form-tab-fuel">Log Fuel</button>
              <button class="tab-btn ${activeTab === "maintenance" ? "active" : ""}" id="form-tab-maintenance">Log Maintenance</button>
            </div>
            <div id="fuel-form-section" ${activeTab !== "fuel" ? 'style="display:none"' : ""}>
              <form id="fuel-form" class="form-grid compact-form">
                <div class="field">
                  <label>Vehicle</label>
                  <select name="vehicle_id" required>${vehicleOptions()}</select>
                </div>
                <div class="split-grid">
                  <div class="field"><label>Liters</label><input name="liters" type="number" step="0.01" min="0.1" required></div>
                  <div class="field"><label>Cost ($)</label><input name="cost" type="number" step="0.01" min="0" required></div>
                </div>
                <div class="split-grid">
                  <div class="field"><label>Odometer KM</label><input name="odometer_km" type="number" step="0.1" min="0" required></div>
                  <div class="field"><label>Filled At</label><input name="filled_at" type="datetime-local" required></div>
                </div>
                <div class="field"><label>Station (optional)</label><input name="station_name" maxlength="120"></div>
                ${renderInlineError("fuel-form-error")}
                <button class="primary-btn" type="submit">Log Fuel</button>
              </form>
            </div>
            <div id="maintenance-form-section" ${activeTab !== "maintenance" ? 'style="display:none"' : ""}>
              <div class="form-mode-label">
                <span id="maint-form-mode-text">Log Maintenance</span>
                <span class="edit-badge" id="maint-edit-badge" style="display:none">Editing</span>
              </div>
              <form id="maintenance-form" class="form-grid compact-form">
                <div class="field">
                  <label>Vehicle</label>
                  <select name="vehicle_id" required>${vehicleOptions()}</select>
                </div>
                <div class="field">
                  <label>Service Type</label>
                  <select name="service_type" required>
                    <option value="inspection">Inspection</option>
                    <option value="oil_change">Oil Change</option>
                    <option value="repair">Repair</option>
                    <option value="engine_service">Engine Service</option>
                    <option value="tire_service">Tire Service</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div class="field">
                  <label>Status</label>
                  <select name="status" required>
                    <option value="scheduled">Scheduled</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div class="split-grid">
                  <div class="field"><label>Service Date</label><input name="service_date" type="date" required></div>
                  <div class="field"><label>Next Due Date</label><input name="next_due_date" type="date"></div>
                </div>
                <div class="field"><label>Cost ($)</label><input name="cost" type="number" step="0.01" min="0" required></div>
                <div class="field"><label>Workshop (optional)</label><input name="workshop_name" maxlength="120"></div>
                <div class="field"><label>Description (optional)</label><input name="description" maxlength="500"></div>
                ${renderInlineError("maintenance-form-error")}
                <div class="form-actions">
                  <button class="primary-btn" type="submit" id="maint-submit-btn">Log Maintenance</button>
                  <button class="ghost-btn" type="button" id="maint-cancel-btn" style="display:none">Cancel</button>
                </div>
              </form>
            </div>
          </section>
        </div>
      </section>
    `,
  });

  bindSharedActions();
  bindTabActions();
  bindFuelActions();
  bindMaintenanceActions();
}

function bindSharedActions() {
  document.getElementById("logout-btn").addEventListener("click", () => logout(_token));
}

function bindTabActions() {
  document.getElementById("tab-fuel").addEventListener("click", () => switchTab("fuel"));
  document.getElementById("tab-maintenance").addEventListener("click", () => switchTab("maintenance"));
  document.getElementById("form-tab-fuel").addEventListener("click", () => switchTab("fuel"));
  document.getElementById("form-tab-maintenance").addEventListener("click", () => switchTab("maintenance"));
}

function switchTab(tab) {
  activeTab = tab;
  const isFuel = tab === "fuel";
  document.getElementById("fuel-tab").style.display = isFuel ? "" : "none";
  document.getElementById("maintenance-tab").style.display = isFuel ? "none" : "";
  document.getElementById("fuel-form-section").style.display = isFuel ? "" : "none";
  document.getElementById("maintenance-form-section").style.display = isFuel ? "none" : "";
  document.querySelectorAll("#tab-fuel, #form-tab-fuel").forEach((b) => b.classList.toggle("active", isFuel));
  document.querySelectorAll("#tab-maintenance, #form-tab-maintenance").forEach((b) => b.classList.toggle("active", !isFuel));
}

function bindFuelActions() {
  document.getElementById("fuel-form").addEventListener("submit", submitFuelForm);
  document.getElementById("fuel-filter-btn").addEventListener("click", applyFuelFilter);
}

function bindMaintenanceActions() {
  document.getElementById("maintenance-form").addEventListener("submit", submitMaintenanceForm);
  document.getElementById("maint-cancel-btn").addEventListener("click", resetMaintenanceForm);
  document.getElementById("maint-filter-btn").addEventListener("click", applyMaintenanceFilter);

  document.querySelectorAll("[data-maint-edit]").forEach((btn) => {
    btn.addEventListener("click", () => startMaintenanceEdit(btn.dataset.maintEdit));
  });
}

async function submitFuelForm(event) {
  event.preventDefault();
  const errorNode = document.getElementById("fuel-form-error");
  errorNode.textContent = "";
  const fd = new FormData(event.currentTarget);
  showLoader("Recording Fuel Log…");
  try {
    await apiRequest("/maintenance/fuel-logs", {
      method: "POST",
      headers: authHeaders(_token),
      body: JSON.stringify({
        vehicle_id: fd.get("vehicle_id"),
        liters: Number(fd.get("liters")),
        cost: Number(fd.get("cost")),
        odometer_km: Number(fd.get("odometer_km")),
        filled_at: new Date(fd.get("filled_at")).toISOString(),
        station_name: fd.get("station_name") || null,
        notes: null,
      }),
    });
    showToast("Fuel log recorded.");
    await loadPage();
  } catch (e) {
    hideLoader();
    errorNode.textContent = e.message;
  }
}

async function startMaintenanceEdit(id) {
  showLoader("Loading Log…");
  try {
    const logs = await apiRequest("/maintenance/maintenance-logs", { headers: authHeaders(_token) });
    const log = logs.find((l) => l.id === id);
    if (!log) { showToast("Log not found.", "error"); return; }
    editingMaintenanceId = id;
    switchTab("maintenance");
    const form = document.getElementById("maintenance-form");
    form.vehicle_id.value = log.vehicle_id;
    form.service_type.value = log.service_type;
    form.status.value = log.status;
    form.service_date.value = log.service_date;
    form.next_due_date.value = log.next_due_date || "";
    form.cost.value = log.cost;
    form.workshop_name.value = log.workshop_name || "";
    form.description.value = log.description || "";
    document.getElementById("maint-form-mode-text").textContent = "Edit Maintenance Log";
    document.getElementById("maint-edit-badge").style.display = "";
    document.getElementById("maint-submit-btn").textContent = "Save Changes";
    document.getElementById("maint-cancel-btn").style.display = "";
  } catch {
    showToast("Could not load log.", "error");
  } finally {
    hideLoader();
  }
}

function resetMaintenanceForm() {
  editingMaintenanceId = null;
  document.getElementById("maintenance-form").reset();
  document.getElementById("maint-form-mode-text").textContent = "Log Maintenance";
  document.getElementById("maint-edit-badge").style.display = "none";
  document.getElementById("maint-submit-btn").textContent = "Log Maintenance";
  document.getElementById("maint-cancel-btn").style.display = "none";
  document.getElementById("maintenance-form-error").textContent = "";
}

async function submitMaintenanceForm(event) {
  event.preventDefault();
  const errorNode = document.getElementById("maintenance-form-error");
  errorNode.textContent = "";
  const fd = new FormData(event.currentTarget);
  const payload = {
    vehicle_id: fd.get("vehicle_id"),
    service_type: fd.get("service_type"),
    status: fd.get("status"),
    service_date: fd.get("service_date"),
    next_due_date: fd.get("next_due_date") || null,
    cost: Number(fd.get("cost")),
    workshop_name: fd.get("workshop_name") || null,
    description: fd.get("description") || null,
  };

  showLoader(editingMaintenanceId ? "Updating Log…" : "Recording Maintenance…");
  try {
    if (editingMaintenanceId) {
      await apiRequest(`/maintenance/maintenance-logs/${editingMaintenanceId}`, { method: "PATCH", headers: authHeaders(_token), body: JSON.stringify(payload) });
      showToast("Maintenance log updated.");
    } else {
      await apiRequest("/maintenance/maintenance-logs", { method: "POST", headers: authHeaders(_token), body: JSON.stringify(payload) });
      showToast("Maintenance log recorded.");
    }
    await loadPage();
  } catch (e) {
    hideLoader();
    errorNode.textContent = e.message;
  }
}

async function applyFuelFilter() {
  const vehicleId = document.getElementById("fuel-vehicle-filter").value;
  const url = vehicleId ? `/maintenance/fuel-logs?vehicle_id=${encodeURIComponent(vehicleId)}` : "/maintenance/fuel-logs";
  showLoader("Filtering…");
  try {
    const [user, fuelLogs, maintenanceLogs] = await Promise.all([
      fetchCurrentUser(_token),
      apiRequest(url, { headers: authHeaders(_token) }),
      apiRequest("/maintenance/maintenance-logs", { headers: authHeaders(_token) }),
    ]);
    render(user, fuelLogs, maintenanceLogs);
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    hideLoader();
  }
}

async function applyMaintenanceFilter() {
  const vehicleId = document.getElementById("maint-vehicle-filter").value;
  const status = document.getElementById("maint-status-filter").value;
  const params = new URLSearchParams();
  if (vehicleId) params.set("vehicle_id", vehicleId);
  if (status) params.set("status", status);
  const url = `/maintenance/maintenance-logs${params.toString() ? "?" + params.toString() : ""}`;
  showLoader("Filtering…");
  try {
    const [user, fuelLogs, maintenanceLogs] = await Promise.all([
      fetchCurrentUser(_token),
      apiRequest("/maintenance/fuel-logs", { headers: authHeaders(_token) }),
      apiRequest(url, { headers: authHeaders(_token) }),
    ]);
    render(user, fuelLogs, maintenanceLogs);
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    hideLoader();
  }
}
