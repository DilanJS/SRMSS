import { apiRequest } from "./api.js";
import { renderEntityTable, renderFilters, renderInlineError, renderShellLayout, showToast, showLoader, hideLoader, openSidePanel, closeSidePanel } from "./components.js";
import { authHeaders, fetchCurrentUser, logout } from "./page-utils.js";

let _container, _token, _role;
let vehicles = [];
let activeTab = "fuel";
let editingMaintenanceId = null;

const canManage = () => _role === "admin" || _role === "manager";

export async function mount(container, token) {
  _container = container;
  _token = token;
  _role = null;
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
    _role = user.role;
    vehicles = vList;
    render(user, fuelLogs, maintenanceLogs);
  } finally {
    hideLoader();
  }
}

const vehicleName = (id) => { const v = vehicles.find((x) => x.id === id); return v ? `${v.registration_no} (${v.model})` : id; };
const vehicleOptions = (selected = "") => vehicles.map((v) =>
  `<option value="${v.id}" ${v.id === selected ? "selected" : ""}>${v.registration_no} – ${v.manufacturer} ${v.model}</option>`
).join("");
const fmtDate = (value) => value ? new Date(value).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" }) : "—";

function render(user, fuelLogs, maintenanceLogs) {
  const totalFuelCost = fuelLogs.reduce((s, l) => s + l.cost, 0).toFixed(2);
  const totalMaintCost = maintenanceLogs.reduce((s, l) => s + l.cost, 0).toFixed(2);
  const pending = maintenanceLogs.filter((l) => l.status === "scheduled" || l.status === "in_progress").length;

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
          <article class="stat-card"><span>Pending Service</span><strong>${pending}</strong></article>
          <article class="stat-card"><span>Maint. Cost</span><strong>$${totalMaintCost}</strong></article>
        </div>
        <section class="panel">
          <div class="tab-bar">
            <button class="tab-btn ${activeTab === "fuel" ? "active" : ""}" id="tab-fuel">Fuel Logs</button>
            <button class="tab-btn ${activeTab === "maintenance" ? "active" : ""}" id="tab-maintenance">Maintenance Logs</button>
          </div>

          <div id="fuel-tab" ${activeTab !== "fuel" ? 'style="display:none"' : ""}>
            ${renderFilters(`
              <select class="filter-input" id="fuel-vehicle-filter" style="max-width:240px">
                <option value="">All Vehicles</option>
                ${vehicleOptions()}
              </select>
              <button class="ghost-btn" id="fuel-filter-btn">Filter</button>
              ${canManage() ? `<button class="primary-btn" id="add-fuel-btn">+ Log Fuel</button>` : ""}
            `)}
            ${renderEntityTable({
              columns: ["Vehicle", "Date", "Liters", "Cost", "Odometer", "Station"],
              rows: fuelLogs.map((l) => `
                <tr>
                  <td>${vehicleName(l.vehicle_id)}</td>
                  <td>${fmtDate(l.filled_at)}</td>
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
              ${canManage() ? `<button class="primary-btn" id="add-maint-btn">+ Log Maintenance</button>` : ""}
            `)}
            ${renderEntityTable({
              columns: ["Vehicle", "Service Type", "Date", "Status", "Cost", "Workshop", "Actions"],
              rows: maintenanceLogs.map((l) => `
                <tr>
                  <td>${vehicleName(l.vehicle_id)}</td>
                  <td>${l.service_type.replace(/_/g, " ")}</td>
                  <td>${fmtDate(l.service_date)}</td>
                  <td><span class="badge ${l.status}">${l.status.replace(/_/g, " ")}</span></td>
                  <td>$${l.cost.toFixed(2)}</td>
                  <td>${l.workshop_name || "—"}</td>
                  <td>${canManage() ? `<div class="table-actions">
                    <button class="table-btn" data-maint-edit="${l.id}">Edit</button>
                  </div>` : ""}</td>
                </tr>
              `),
              emptyMessage: "No maintenance logs recorded yet.",
            })}
          </div>
        </section>
      </section>
    `,
  });

  bindActions();
}

function buildFuelFormHTML() {
  return `
    <form id="fuel-form" class="form-grid">
      <div class="field">
        <label>Vehicle</label>
        <select name="vehicle_id" required>
          <option value="">Select a vehicle…</option>
          ${vehicleOptions()}
        </select>
      </div>
      <div class="split-grid">
        <div class="field"><label>Liters</label><input name="liters" type="number" step="0.01" min="0.1" required></div>
        <div class="field"><label>Cost ($)</label><input name="cost" type="number" step="0.01" min="0" required></div>
      </div>
      <div class="split-grid">
        <div class="field"><label>Odometer (km)</label><input name="odometer_km" type="number" step="0.1" min="0" required></div>
        <div class="field"><label>Filled At</label><input name="filled_at" type="datetime-local" required></div>
      </div>
      <div class="field"><label>Station (optional)</label><input name="station_name" maxlength="120"></div>
      ${renderInlineError("fuel-form-error")}
    </form>
  `;
}

function buildMaintenanceFormHTML(log = null) {
  const v = (field) => log ? (log[field] ?? "") : "";
  const sel = (field, val) => v(field) === val ? "selected" : "";
  return `
    <form id="maintenance-form" class="form-grid">
      <div class="field">
        <label>Vehicle</label>
        <select name="vehicle_id" required>
          <option value="">Select a vehicle…</option>
          ${vehicleOptions(v("vehicle_id"))}
        </select>
      </div>
      <div class="field">
        <label>Service Type</label>
        <select name="service_type" required>
          <option value="inspection" ${sel("service_type","inspection")}>Inspection</option>
          <option value="oil_change" ${sel("service_type","oil_change")}>Oil Change</option>
          <option value="repair" ${sel("service_type","repair")}>Repair</option>
          <option value="engine_service" ${sel("service_type","engine_service")}>Engine Service</option>
          <option value="tire_service" ${sel("service_type","tire_service")}>Tire Service</option>
          <option value="other" ${sel("service_type","other")}>Other</option>
        </select>
      </div>
      <div class="field">
        <label>Status</label>
        <select name="status" required>
          <option value="scheduled" ${sel("status","scheduled")}>Scheduled</option>
          <option value="in_progress" ${sel("status","in_progress")}>In Progress</option>
          <option value="completed" ${sel("status","completed")}>Completed</option>
          <option value="cancelled" ${sel("status","cancelled")}>Cancelled</option>
        </select>
      </div>
      <div class="split-grid">
        <div class="field"><label>Service Date</label><input name="service_date" type="date" value="${v("service_date")}" required></div>
        <div class="field"><label>Next Due Date</label><input name="next_due_date" type="date" value="${v("next_due_date") || ""}"></div>
      </div>
      <div class="field"><label>Cost ($)</label><input name="cost" type="number" step="0.01" min="0" value="${v("cost")}" required></div>
      <div class="field"><label>Workshop (optional)</label><input name="workshop_name" maxlength="120" value="${v("workshop_name") || ""}"></div>
      <div class="field"><label>Description (optional)</label><input name="description" maxlength="500" value="${v("description") || ""}"></div>
      ${renderInlineError("maintenance-form-error")}
    </form>
  `;
}

function openFuelPanel() {
  openSidePanel({
    title: "Log Fuel",
    subtitle: "Record a fuel fill-up for a vehicle.",
    body: buildFuelFormHTML(),
    footer: `
      <button class="primary-btn" id="fuel-panel-submit" type="button">Record Fuel Log</button>
      <button class="ghost-btn" type="button" id="fuel-panel-cancel">Cancel</button>
    `,
  });
  document.getElementById("fuel-panel-submit").addEventListener("click", submitFuelForm);
  document.getElementById("fuel-panel-cancel").addEventListener("click", closeSidePanel);
}

function openMaintenancePanel(log = null) {
  editingMaintenanceId = log?.id || null;
  openSidePanel({
    title: log ? "Edit Maintenance Log" : "Log Maintenance",
    subtitle: log ? `Editing service record` : "Record a maintenance or service event.",
    body: buildMaintenanceFormHTML(log),
    footer: `
      <button class="primary-btn" id="maint-panel-submit" type="button">${log ? "Save Changes" : "Record Maintenance"}</button>
      <button class="ghost-btn" type="button" id="maint-panel-cancel">Cancel</button>
    `,
  });
  document.getElementById("maint-panel-submit").addEventListener("click", submitMaintenanceForm);
  document.getElementById("maint-panel-cancel").addEventListener("click", closeSidePanel);
}

function bindActions() {
  document.getElementById("logout-btn").addEventListener("click", () => logout(_token));
  document.getElementById("tab-fuel").addEventListener("click", () => switchTab("fuel"));
  document.getElementById("tab-maintenance").addEventListener("click", () => switchTab("maintenance"));
  document.getElementById("add-fuel-btn")?.addEventListener("click", openFuelPanel);
  document.getElementById("add-maint-btn")?.addEventListener("click", () => openMaintenancePanel());
  document.getElementById("fuel-filter-btn").addEventListener("click", applyFuelFilter);
  document.getElementById("maint-filter-btn").addEventListener("click", applyMaintenanceFilter);

  document.querySelectorAll("[data-maint-edit]").forEach((btn) => {
    btn.addEventListener("click", () => startMaintenanceEdit(btn.dataset.maintEdit));
  });
}

function switchTab(tab) {
  activeTab = tab;
  const isFuel = tab === "fuel";
  document.getElementById("fuel-tab").style.display = isFuel ? "" : "none";
  document.getElementById("maintenance-tab").style.display = isFuel ? "none" : "";
  document.querySelectorAll("#tab-fuel").forEach((b) => b.classList.toggle("active", isFuel));
  document.querySelectorAll("#tab-maintenance").forEach((b) => b.classList.toggle("active", !isFuel));
}

async function submitFuelForm() {
  const errorNode = document.getElementById("fuel-form-error");
  errorNode.textContent = "";
  const form = document.getElementById("fuel-form");
  if (!form.checkValidity()) { form.reportValidity(); return; }

  const fd = new FormData(form);
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
    closeSidePanel();
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
    openMaintenancePanel(log);
  } catch {
    showToast("Could not load log.", "error");
  } finally {
    hideLoader();
  }
}

async function submitMaintenanceForm() {
  const errorNode = document.getElementById("maintenance-form-error");
  errorNode.textContent = "";
  const form = document.getElementById("maintenance-form");
  if (!form.checkValidity()) { form.reportValidity(); return; }

  const fd = new FormData(form);
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
    closeSidePanel();
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
  } finally {
    hideLoader();
  }
}
