import { apiRequest } from "./api.js";
import { renderEntityTable, renderFilters, renderInlineError, renderManagementPage, showConfirm, showToast, showLoader, hideLoader } from "./components.js";
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
  hideLoader();
}

function fmt(value) {
  return new Date(value).toLocaleString([], {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function routeName(id) {
  const r = routes.find((x) => x.id === id);
  return r ? `${r.route_code} – ${r.route_name}` : id;
}

function vehicleName(id) {
  const v = vehicles.find((x) => x.id === id);
  return v ? v.registration_no : id;
}

function driverName(id) {
  const d = drivers.find((x) => x.id === id);
  return d ? d.full_name : id;
}

function routeOptions(selected = "") {
  return routes.map((r) =>
    `<option value="${r.id}" ${r.id === selected ? "selected" : ""}>${r.route_code} – ${r.route_name}</option>`
  ).join("");
}

function vehicleOptions(selected = "") {
  return vehicles.map((v) =>
    `<option value="${v.id}" ${v.id === selected ? "selected" : ""}>${v.registration_no} (${v.manufacturer} ${v.model})</option>`
  ).join("");
}

function driverOptions(selected = "") {
  return drivers.map((d) =>
    `<option value="${d.id}" ${d.id === selected ? "selected" : ""}>${d.full_name} (${d.employee_no})</option>`
  ).join("");
}

function render(user, schedules) {
  const byStatus = (s) => schedules.filter((x) => x.status === s).length;

  _container.innerHTML = renderManagementPage({
    user,
    activeNav: "schedules",
    title: "Schedule Management",
    subtitle: "Plan and monitor all route trips, detect conflicts, and handle emergency updates.",
    statsCards: [
      { label: "Total Schedules", value: schedules.length },
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
      <button class="ghost-btn" id="schedule-search-btn" type="button">Filter</button>
    `),
    formTitle: "Schedule",
    formMarkup: `
      <div class="form-mode-label">
        <span id="form-mode-text">Create Schedule</span>
        <span class="edit-badge" id="edit-badge" style="display:none">Editing</span>
      </div>
      <form id="schedule-form" class="form-grid compact-form">
        <div class="field">
          <label>Route</label>
          <select name="route_id" required>${routeOptions()}</select>
        </div>
        <div class="field">
          <label>Vehicle</label>
          <select name="vehicle_id" required>${vehicleOptions()}</select>
        </div>
        <div class="field">
          <label>Driver</label>
          <select name="driver_id" required>${driverOptions()}</select>
        </div>
        <div class="split-grid">
          <div class="field"><label>Departure</label><input name="departure_time" type="datetime-local" required></div>
          <div class="field"><label>Arrival</label><input name="arrival_time" type="datetime-local" required></div>
        </div>
        <div class="field" id="status-edit-field" style="display:none">
          <label>Status</label>
          <select name="status">
            <option value="scheduled">Scheduled</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="delayed">Delayed</option>
            <option value="emergency">Emergency</option>
          </select>
        </div>
        <div class="field">
          <label>Notes (optional)</label>
          <input name="notes" type="text" maxlength="500">
        </div>
        <div id="conflict-warning" class="error-text" style="display:none"></div>
        ${renderInlineError("schedule-form-error")}
        <div class="form-actions">
          <button class="ghost-btn" type="button" id="check-conflicts-btn">Check Conflicts</button>
          <button class="primary-btn" type="submit" id="schedule-submit-btn">Create Schedule</button>
        </div>
        <button class="ghost-btn" type="button" id="schedule-cancel-btn" style="display:none">Cancel Edit</button>
      </form>
    `,
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
          <td style="display:flex;gap:6px">
            <button class="table-btn" data-sched-edit="${s.id}">Edit</button>
            <button class="table-btn danger-btn" data-sched-delete="${s.id}">Delete</button>
          </td>
        </tr>
      `),
      emptyMessage: "No schedules found.",
    }),
  });

  bindSharedActions();
  bindScheduleActions();
}

function bindSharedActions() {
  document.getElementById("logout-btn").addEventListener("click", () => logout(_token));
}

function bindScheduleActions() {
  document.getElementById("schedule-form").addEventListener("submit", submitScheduleForm);
  document.getElementById("schedule-cancel-btn").addEventListener("click", resetForm);
  document.getElementById("schedule-search-btn").addEventListener("click", applyFilter);
  document.getElementById("check-conflicts-btn").addEventListener("click", checkConflicts);

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

async function checkConflicts() {
  const form = document.getElementById("schedule-form");
  const warningNode = document.getElementById("conflict-warning");
  warningNode.style.display = "none";

  const payload = buildPayload(new FormData(form));
  try {
    validatePayload(payload);
  } catch (e) {
    warningNode.textContent = e.message;
    warningNode.style.display = "";
    return;
  }

  try {
    const result = await apiRequest("/schedules/conflicts", {
      method: "POST",
      headers: authHeaders(_token),
      body: JSON.stringify(payload),
    });
    if (result.has_conflict) {
      warningNode.textContent = "Conflicts detected: " + result.conflicts.join("; ");
      warningNode.style.display = "";
    } else {
      showToast("No conflicts detected. Safe to schedule.", "success");
    }
  } catch (e) {
    warningNode.textContent = e.message;
    warningNode.style.display = "";
  }
}

async function startEdit(id) {
  showLoader("Loading Schedule…");
  try {
    const sched = await apiRequest(`/schedules/${id}`, { headers: authHeaders(_token) });
    editingId = id;
    const form = document.getElementById("schedule-form");
    form.route_id.value = sched.route_id;
    form.vehicle_id.value = sched.vehicle_id;
    form.driver_id.value = sched.driver_id;
    form.departure_time.value = toLocalDatetime(sched.departure_time);
    form.arrival_time.value = toLocalDatetime(sched.arrival_time);
    form.status.value = sched.status;
    form.notes.value = sched.notes || "";
    document.getElementById("form-mode-text").textContent = "Edit Schedule";
    document.getElementById("edit-badge").style.display = "";
    document.getElementById("schedule-submit-btn").textContent = "Save Changes";
    document.getElementById("schedule-cancel-btn").style.display = "";
    document.getElementById("status-edit-field").style.display = "";
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch {
    showToast("Could not load schedule data.", "error");
  } finally {
    hideLoader();
  }
}

function resetForm() {
  editingId = null;
  document.getElementById("schedule-form").reset();
  document.getElementById("form-mode-text").textContent = "Create Schedule";
  document.getElementById("edit-badge").style.display = "none";
  document.getElementById("schedule-submit-btn").textContent = "Create Schedule";
  document.getElementById("schedule-cancel-btn").style.display = "none";
  document.getElementById("status-edit-field").style.display = "none";
  document.getElementById("schedule-form-error").textContent = "";
  document.getElementById("conflict-warning").style.display = "none";
}

function buildPayload(formData) {
  const departureRaw = formData.get("departure_time");
  const arrivalRaw = formData.get("arrival_time");
  return {
    route_id: formData.get("route_id") || null,
    vehicle_id: formData.get("vehicle_id") || null,
    driver_id: formData.get("driver_id") || null,
    departure_time: departureRaw ? new Date(departureRaw).toISOString() : null,
    arrival_time: arrivalRaw ? new Date(arrivalRaw).toISOString() : null,
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

async function submitScheduleForm(event) {
  event.preventDefault();
  const errorNode = document.getElementById("schedule-form-error");
  errorNode.textContent = "";
  const formData = new FormData(event.currentTarget);
  const payload = buildPayload(formData);

  try {
    validatePayload(payload);
  } catch (e) {
    errorNode.textContent = e.message;
    return;
  }

  showLoader(editingId ? "Updating Schedule…" : "Creating Schedule…");
  try {
    if (editingId) {
      payload.status = formData.get("status");
      await apiRequest(`/schedules/${editingId}`, { method: "PATCH", headers: authHeaders(_token), body: JSON.stringify(payload) });
      showToast("Schedule updated.");
    } else {
      payload.status = "scheduled";
      await apiRequest("/schedules", { method: "POST", headers: authHeaders(_token), body: JSON.stringify(payload) });
      showToast("Schedule created.");
    }
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
  showLoader("Filtering Schedules…");
  try {
    const status = document.getElementById("status-filter").value;
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
