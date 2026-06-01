import { apiRequest } from "./api.js";
import { renderEntityTable, renderFilters, renderInlineError, renderManagementPage, showConfirm, showToast, showLoader, hideLoader, openSidePanel, closeSidePanel } from "./components.js";
import { authHeaders, fetchCurrentUser, logout } from "./page-utils.js";

let _container, _token;
let editingId = null;
let routes = [];
let vehicles = [];
let drivers = [];

export async function mount(container, token) {
  _container = container;
  _token = token;
  editingId = null;
  await loadPage();
}

async function loadPage() {
  showLoader("Loading Schedules…");
  try {
    const [user, schedules, r, v, d] = await Promise.all([
      fetchCurrentUser(_token),
      apiRequest("/schedules", { headers: authHeaders(_token) }),
      apiRequest("/routes", { headers: authHeaders(_token) }),
      apiRequest("/vehicles", { headers: authHeaders(_token) }),
      apiRequest("/drivers", { headers: authHeaders(_token) }),
    ]);
    routes = r;
    vehicles = v;
    drivers = d;
    render(user, schedules);
  } finally {
    hideLoader();
  }
}

const fmt = (value) => new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const routeName = (id) => { const r = routes.find((x) => x.id === id); return r ? `${r.route_code} – ${r.route_name}` : id; };
const vehicleName = (id) => { const v = vehicles.find((x) => x.id === id); return v ? v.registration_no : id; };
const driverName = (id) => { const d = drivers.find((x) => x.id === id); return d ? d.full_name : id; };

function routeOptions(selected = "") {
  return routes.map((r) => `<option value="${r.id}" ${r.id === selected ? "selected" : ""}>${r.route_code} – ${r.route_name}</option>`).join("");
}
function vehicleOptions(selected = "") {
  return vehicles.map((v) => `<option value="${v.id}" ${v.id === selected ? "selected" : ""}>${v.registration_no} (${v.manufacturer} ${v.model})</option>`).join("");
}
function driverOptions(selected = "") {
  return drivers.map((d) => `<option value="${d.id}" ${d.id === selected ? "selected" : ""}>${d.full_name} (${d.employee_no})</option>`).join("");
}

function render(user, schedules) {
  const byStatus = (s) => schedules.filter((x) => x.status === s).length;

  _container.innerHTML = renderManagementPage({
    user,
    activeNav: "schedules",
    title: "Schedule Management",
    subtitle: "Plan and monitor all route trips, detect conflicts, and handle emergency updates.",
    statsCards: [
      { label: "Total", value: schedules.length },
      { label: "Scheduled", value: byStatus("scheduled") },
      { label: "Active", value: byStatus("active") },
      { label: "Completed", value: byStatus("completed") },
      { label: "Emergency", value: schedules.filter((x) => x.emergency_update).length },
    ],
    filterMarkup: renderFilters(`
      <select class="filter-input" id="status-filter" style="max-width:180px">
        <option value="">All Statuses</option>
        <option value="scheduled">Scheduled</option>
        <option value="active">Active</option>
        <option value="completed">Completed</option>
        <option value="cancelled">Cancelled</option>
        <option value="delayed">Delayed</option>
        <option value="emergency">Emergency</option>
      </select>
      <button class="ghost-btn" id="schedule-filter-btn" type="button">Filter</button>
      <button class="primary-btn" id="create-schedule-btn" type="button">+ New Schedule</button>
    `),
    tableTitle: "Schedules",
    tableMarkup: renderEntityTable({
      columns: ["Route", "Vehicle", "Driver", "Departure", "Arrival", "Status", "Actions"],
      rows: schedules.map((s) => `
        <tr>
          <td>${routeName(s.route_id)}</td>
          <td>${vehicleName(s.vehicle_id)}</td>
          <td>${driverName(s.driver_id)}</td>
          <td>${fmt(s.departure_time)}</td>
          <td>${fmt(s.arrival_time)}</td>
          <td>
            <span class="badge ${s.status}">${s.status}</span>
            ${s.emergency_update ? `<span class="badge emergency" style="margin-left:4px">!</span>` : ""}
          </td>
          <td><div class="table-actions">
            <button class="table-btn" data-sched-edit="${s.id}">Edit</button>
            <button class="table-btn danger-btn" data-sched-delete="${s.id}">Delete</button>
          </div></td>
        </tr>
      `),
      emptyMessage: "No schedules yet. Click + New Schedule to create one.",
    }),
  });

  bindActions();
}

function buildFormHTML(sched = null) {
  const v = (field) => sched ? (sched[field] ?? "") : "";
  const sel = (field, val) => v(field) === val ? "selected" : "";
  return `
    <form id="schedule-form" class="form-grid">
      <div class="field">
        <label>Route</label>
        <select name="route_id" required>
          <option value="">Select a route…</option>
          ${routeOptions(v("route_id"))}
        </select>
      </div>
      <div class="field">
        <label>Vehicle</label>
        <select name="vehicle_id" required>
          <option value="">Select a vehicle…</option>
          ${vehicleOptions(v("vehicle_id"))}
        </select>
      </div>
      <div class="field">
        <label>Driver</label>
        <select name="driver_id" required>
          <option value="">Select a driver…</option>
          ${driverOptions(v("driver_id"))}
        </select>
      </div>
      <div class="split-grid">
        <div class="field">
          <label>Departure</label>
          <input name="departure_time" type="datetime-local" value="${v("departure_time") ? toLocalDatetime(v("departure_time")) : ""}" required>
        </div>
        <div class="field">
          <label>Arrival</label>
          <input name="arrival_time" type="datetime-local" value="${v("arrival_time") ? toLocalDatetime(v("arrival_time")) : ""}" required>
        </div>
      </div>
      ${sched ? `
        <div class="field">
          <label>Status</label>
          <select name="status">
            <option value="scheduled" ${sel("status","scheduled")}>Scheduled</option>
            <option value="active" ${sel("status","active")}>Active</option>
            <option value="completed" ${sel("status","completed")}>Completed</option>
            <option value="cancelled" ${sel("status","cancelled")}>Cancelled</option>
            <option value="delayed" ${sel("status","delayed")}>Delayed</option>
            <option value="emergency" ${sel("status","emergency")}>Emergency</option>
          </select>
        </div>
      ` : ""}
      <div class="field">
        <label>Notes (optional)</label>
        <input name="notes" type="text" maxlength="500" value="${v("notes") || ""}">
      </div>
      <div id="conflict-warning" class="error-text" style="display:none"></div>
      ${renderInlineError("schedule-form-error")}
    </form>
  `;
}

function openSchedulePanel(sched = null) {
  editingId = sched?.id || null;
  openSidePanel({
    title: sched ? "Edit Schedule" : "New Schedule",
    subtitle: sched ? `Editing schedule entry` : "Plan a new trip assignment.",
    body: buildFormHTML(sched),
    footer: `
      <button class="ghost-btn" id="check-conflicts-btn" type="button">Check Conflicts</button>
      <button class="primary-btn" id="schedule-panel-submit" type="button">${sched ? "Save Changes" : "Create Schedule"}</button>
      <button class="ghost-btn" type="button" id="schedule-panel-cancel">Cancel</button>
    `,
  });
  document.getElementById("schedule-panel-submit").addEventListener("click", submitScheduleForm);
  document.getElementById("schedule-panel-cancel").addEventListener("click", closeSidePanel);
  document.getElementById("check-conflicts-btn").addEventListener("click", checkConflicts);
}

function bindActions() {
  document.getElementById("logout-btn").addEventListener("click", () => logout(_token));
  document.getElementById("create-schedule-btn").addEventListener("click", () => openSchedulePanel());
  document.getElementById("schedule-filter-btn").addEventListener("click", applyFilter);

  document.querySelectorAll("[data-sched-edit]").forEach((btn) => {
    btn.addEventListener("click", () => startEdit(btn.dataset.schedEdit));
  });

  document.querySelectorAll("[data-sched-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      showConfirm({
        title: "Delete Schedule",
        message: "Delete this schedule entry? This cannot be undone.",
        onConfirm: () => deleteSchedule(btn.dataset.schedDelete),
      });
    });
  });
}

async function startEdit(id) {
  showLoader("Loading Schedule…");
  try {
    const sched = await apiRequest(`/schedules/${id}`, { headers: authHeaders(_token) });
    openSchedulePanel(sched);
  } catch {
    showToast("Could not load schedule data.", "error");
  } finally {
    hideLoader();
  }
}

function buildPayload(formData) {
  const dep = formData.get("departure_time");
  const arr = formData.get("arrival_time");
  return {
    route_id: formData.get("route_id") || null,
    vehicle_id: formData.get("vehicle_id") || null,
    driver_id: formData.get("driver_id") || null,
    departure_time: dep ? new Date(dep).toISOString() : null,
    arrival_time: arr ? new Date(arr).toISOString() : null,
    notes: formData.get("notes") || null,
  };
}

function validatePayload(payload) {
  if (!payload.route_id || !payload.vehicle_id || !payload.driver_id) {
    throw new Error("Please select a route, vehicle, and driver.");
  }
  if (!payload.departure_time || !payload.arrival_time) {
    throw new Error("Please fill in both departure and arrival times.");
  }
  if (new Date(payload.arrival_time) <= new Date(payload.departure_time)) {
    throw new Error("Arrival time must be after departure time.");
  }
}

async function checkConflicts() {
  const warningNode = document.getElementById("conflict-warning");
  warningNode.style.display = "none";
  const payload = buildPayload(new FormData(document.getElementById("schedule-form")));
  try {
    validatePayload(payload);
  } catch (e) {
    warningNode.textContent = e.message;
    warningNode.style.display = "";
    return;
  }
  try {
    const result = await apiRequest("/schedules/conflicts", { method: "POST", headers: authHeaders(_token), body: JSON.stringify(payload) });
    if (result.has_conflict) {
      warningNode.textContent = "Conflicts: " + result.conflicts.join("; ");
      warningNode.style.display = "";
    } else {
      showToast("No conflicts detected. Safe to schedule.", "success");
    }
  } catch (e) {
    warningNode.textContent = e.message;
    warningNode.style.display = "";
  }
}

async function submitScheduleForm() {
  const errorNode = document.getElementById("schedule-form-error");
  errorNode.textContent = "";
  const form = document.getElementById("schedule-form");
  const payload = buildPayload(new FormData(form));
  try { validatePayload(payload); } catch (e) { errorNode.textContent = e.message; return; }

  showLoader(editingId ? "Updating Schedule…" : "Creating Schedule…");
  try {
    if (editingId) {
      payload.status = new FormData(form).get("status");
      await apiRequest(`/schedules/${editingId}`, { method: "PATCH", headers: authHeaders(_token), body: JSON.stringify(payload) });
      showToast("Schedule updated.");
    } else {
      payload.status = "scheduled";
      await apiRequest("/schedules", { method: "POST", headers: authHeaders(_token), body: JSON.stringify(payload) });
      showToast("Schedule created.");
    }
    closeSidePanel();
    await loadPage();
  } catch (error) {
    hideLoader();
    errorNode.textContent = error.message;
  }
}

async function deleteSchedule(id) {
  showLoader("Deleting Schedule…");
  try {
    await apiRequest(`/schedules/${id}`, { method: "DELETE", headers: authHeaders(_token) });
    showToast("Schedule deleted.", "info");
    await loadPage();
  } catch (e) {
    hideLoader();
    showToast(e.message, "error");
  }
}

async function applyFilter() {
  const status = document.getElementById("status-filter").value;
  showLoader("Filtering…");
  try {
    const url = status ? `/schedules?status=${encodeURIComponent(status)}` : "/schedules";
    const [user, schedules] = await Promise.all([
      fetchCurrentUser(_token),
      apiRequest(url, { headers: authHeaders(_token) }),
    ]);
    render(user, schedules);
  } finally {
    hideLoader();
  }
}

function toLocalDatetime(isoString) {
  const d = new Date(isoString);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
