import { apiRequest } from "./api.js";
import { renderEntityTable, renderFilters, renderInlineError, renderManagementPage, renderPagination, showConfirm, showToast, showLoader, hideLoader, openSidePanel, closeSidePanel } from "./components.js";
import { authHeaders, fetchCurrentUser, logout } from "./page-utils.js";

// ── Module state ──────────────────────────────────────────────────────────────

let _container, _token, _role;
let _user = null;
let _allSchedules = [];
let _currentStatusFilter = "";
let _dateFrom = "", _dateTo = "";
let _total = 0, _summary = {};
let viewMode = "calendar";
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth(); // 0-indexed
let editingId = null;
let routes = [];
let vehicles = [];
let drivers = [];

const canManage = () => _role === "admin" || _role === "manager";

// ── Entry point ───────────────────────────────────────────────────────────────

export async function mount(container, token) {
  _container = container;
  _token = token;
  _role = null;
  editingId = null;
  _currentStatusFilter = "";
  _dateFrom = "";
  _dateTo = "";
  await loadPage();
}

async function loadPage() {
  showLoader("Loading Schedules…");
  try {
    const schedParams = new URLSearchParams({ page: 1, page_size: 1000 });
    if (_currentStatusFilter) schedParams.set("status", _currentStatusFilter);
    if (_dateFrom) schedParams.set("date_from", new Date(_dateFrom).toISOString());
    if (_dateTo) {
      const to = new Date(_dateTo);
      to.setHours(23, 59, 59, 999);
      schedParams.set("date_to", to.toISOString());
    }
    const [user, schedResult, rResult, vResult, dResult] = await Promise.all([
      fetchCurrentUser(_token),
      apiRequest(`/schedules?${schedParams}`, { headers: authHeaders(_token) }),
      apiRequest("/routes?page=1&page_size=1000", { headers: authHeaders(_token) }),
      apiRequest("/vehicles?page=1&page_size=1000", { headers: authHeaders(_token) }),
      apiRequest("/drivers?page=1&page_size=1000", { headers: authHeaders(_token) }),
    ]);
    _role = user.role;
    _user = user;
    _allSchedules = schedResult.items;
    _total = schedResult.total;
    _summary = schedResult.summary;
    routes = rResult.items;
    vehicles = vResult.items;
    drivers = dResult.items;
    render(user, schedResult.items);
  } finally {
    hideLoader();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (value) =>
  new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const routeName = (id) => {
  const r = routes.find((x) => x.id === id);
  return r ? `${r.route_code} – ${r.route_name}` : id;
};
const routeCode = (id) => {
  const r = routes.find((x) => x.id === id);
  return r ? r.route_code : "?";
};
const vehicleName = (id) => {
  const v = vehicles.find((x) => x.id === id);
  return v ? v.registration_no : id;
};
const driverName = (id) => {
  const d = drivers.find((x) => x.id === id);
  return d ? d.full_name : id;
};

function routeOptions(selected = "") {
  return routes
    .map((r) => `<option value="${r.id}" ${r.id === selected ? "selected" : ""}>${r.route_code} – ${r.route_name}</option>`)
    .join("");
}
function vehicleOptions(selected = "") {
  return vehicles
    .map((v) => `<option value="${v.id}" ${v.id === selected ? "selected" : ""}>${v.registration_no} (${v.manufacturer} ${v.model})</option>`)
    .join("");
}
function driverOptions(selected = "") {
  return drivers
    .map((d) => `<option value="${d.id}" ${d.id === selected ? "selected" : ""}>${d.full_name} (${d.employee_no})</option>`)
    .join("");
}

// ── Calendar view ─────────────────────────────────────────────────────────────

function buildCalendarHTML(schedules) {
  const pad = (n) => String(n).padStart(2, "0");
  const localDateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const firstDay = new Date(currentYear, currentMonth, 1);
  const startDow = (firstDay.getDay() + 6) % 7; // Mon=0 … Sun=6

  // Group by local date so events appear on the correct calendar cell
  const byDate = {};
  for (const s of schedules) {
    const key = localDateKey(new Date(s.departure_time));
    (byDate[key] ??= []).push(s);
  }

  const todayStr = localDateKey(new Date());
  const monthLabel = new Date(currentYear, currentMonth, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const headerRow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    .map((d) => `<div class="cal-header-cell">${d}</div>`)
    .join("");

  let cells = "";
  for (let i = 0; i < 42; i++) {
    const date = new Date(currentYear, currentMonth, 1 - startDow + i);
    const dateStr = localDateKey(date);
    const isCurrent = date.getMonth() === currentMonth;
    const isToday = dateStr === todayStr;
    const dayScheds = byDate[dateStr] || [];

    const MAX_VISIBLE = 3;
    const visible = dayScheds.slice(0, MAX_VISIBLE);
    const overflow = dayScheds.length - MAX_VISIBLE;

    const events = visible
      .map((s) => {
        const time = new Date(s.departure_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const arrTime = new Date(s.arrival_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const code = routeCode(s.route_id);
        const tip = `${routeName(s.route_id)} · ${time}–${arrTime} · ${driverName(s.driver_id)} · ${vehicleName(s.vehicle_id)}`;
        return `<div class="cal-event ${s.status}" data-sched-view="${s.id}" title="${tip.replace(/"/g, "&quot;")}">
          <span class="cal-event-dot"></span>${code} ${time}
        </div>`;
      })
      .join("");

    const more =
      overflow > 0 ? `<div class="cal-more" data-cal-overflow="${dateStr}">+${overflow} more</div>` : "";

    const cls = ["cal-cell", !isCurrent && "other-month", isToday && "today"].filter(Boolean).join(" ");
    cells += `<div class="${cls}">
      <span class="cal-day-num">${date.getDate()}</span>
      ${events}${more}
    </div>`;
  }

  return `
    <div class="cal-nav">
      <div class="cal-nav-center">
        <button class="ghost-btn" id="cal-prev-btn" type="button" aria-label="Previous month">‹</button>
        <span class="cal-month-title">${monthLabel}</span>
        <button class="ghost-btn" id="cal-next-btn" type="button" aria-label="Next month">›</button>
      </div>
      <button class="ghost-btn" id="cal-today-btn" type="button">Today</button>
    </div>
    <div class="cal-header-row">${headerRow}</div>
    <div class="cal-grid">${cells}</div>
  `;
}

// ── List view ─────────────────────────────────────────────────────────────────

function buildListHTML(schedules) {
  return renderEntityTable({
    columns: ["Route", "Vehicle", "Driver", "Departure", "Arrival", "Status", "Actions"],
    rows: schedules.map(
      (s) => `
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
          <td>${canManage()
            ? `<div class="table-actions">
                <button class="table-btn" data-sched-edit="${s.id}">Edit</button>
                <button class="table-btn danger-btn" data-sched-delete="${s.id}">Delete</button>
              </div>`
            : ""
          }</td>
        </tr>
      `
    ),
    emptyMessage: "No schedules yet. Click + New Schedule to create one.",
  });
}

// ── Render ────────────────────────────────────────────────────────────────────

function render(user, schedules) {
  const opt = (val, label) =>
    `<option value="${val}" ${_currentStatusFilter === val ? "selected" : ""}>${label}</option>`;

  _container.innerHTML = renderManagementPage({
    user,
    activeNav: "schedules",
    title: "Schedule Management",
    subtitle: "Plan and monitor all route trips, detect conflicts, and handle emergency updates.",
    statsCards: [
      { label: "Total", value: _total },
      { label: "Scheduled", value: _summary.scheduled ?? 0 },
      { label: "Active", value: _summary.active ?? 0 },
      { label: "Completed", value: _summary.completed ?? 0 },
      { label: "Emergency", value: _summary.emergency_flag ?? 0 },
    ],
    filterMarkup: renderFilters(`
      <select class="filter-input" id="status-filter" style="max-width:180px">
        ${opt("", "All Statuses")}
        ${opt("scheduled", "Scheduled")}
        ${opt("active", "Active")}
        ${opt("completed", "Completed")}
        ${opt("cancelled", "Cancelled")}
        ${opt("delayed", "Delayed")}
        ${opt("emergency", "Emergency")}
      </select>
      <input class="filter-input" type="date" id="date-from-filter" value="${_dateFrom}" style="max-width:160px" title="From date">
      <input class="filter-input" type="date" id="date-to-filter" value="${_dateTo}" style="max-width:160px" title="To date">
      <button class="ghost-btn" id="schedule-filter-btn" type="button">Filter</button>
      <button class="ghost-btn" id="schedule-clear-btn" type="button">Clear</button>
      <div class="view-toggle" role="group" aria-label="View mode">
        <button class="view-toggle-btn ${viewMode === "calendar" ? "active" : ""}" id="view-cal-btn" type="button">Calendar</button>
        <button class="view-toggle-btn ${viewMode === "list" ? "active" : ""}" id="view-list-btn" type="button">List</button>
      </div>
      ${canManage() ? `<button class="primary-btn" id="create-schedule-btn" type="button">+ New Schedule</button>` : ""}
    `),
    tableTitle: "Schedules",
    tableMarkup: viewMode === "calendar" ? buildCalendarHTML(schedules) : buildListHTML(schedules),
  });

  bindActions();
}

// ── Event binding ─────────────────────────────────────────────────────────────

function bindActions() {
  document.getElementById("logout-btn").addEventListener("click", () => logout(_token));
  document.getElementById("create-schedule-btn")?.addEventListener("click", () => openSchedulePanel());
  document.getElementById("schedule-filter-btn").addEventListener("click", applyFilter);
  document.getElementById("schedule-clear-btn").addEventListener("click", clearFilter);

  // View toggle
  document.getElementById("view-cal-btn")?.addEventListener("click", () => {
    viewMode = "calendar";
    render(_user, _allSchedules);
  });
  document.getElementById("view-list-btn")?.addEventListener("click", () => {
    viewMode = "list";
    render(_user, _allSchedules);
  });

  // Calendar navigation
  document.getElementById("cal-prev-btn")?.addEventListener("click", () => {
    if (currentMonth === 0) { currentMonth = 11; currentYear--; }
    else currentMonth--;
    render(_user, _allSchedules);
  });
  document.getElementById("cal-next-btn")?.addEventListener("click", () => {
    if (currentMonth === 11) { currentMonth = 0; currentYear++; }
    else currentMonth++;
    render(_user, _allSchedules);
  });
  document.getElementById("cal-today-btn")?.addEventListener("click", () => {
    currentYear = new Date().getFullYear();
    currentMonth = new Date().getMonth();
    render(_user, _allSchedules);
  });

  // Calendar event click → edit (managers) or view panel (others)
  document.querySelectorAll("[data-sched-view]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const sched = _allSchedules.find((s) => s.id === el.dataset.schedView);
      if (!sched) return;
      if (canManage()) startEdit(sched.id);
      else openViewPanel(sched);
    });
  });

  // "+X more" overflow chip → switch to list view
  document.querySelectorAll("[data-cal-overflow]").forEach((el) => {
    el.addEventListener("click", () => {
      viewMode = "list";
      render(_user, _allSchedules);
    });
  });

  // List view edit / delete
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

// ── Read-only view panel (driver / user roles) ────────────────────────────────

function openViewPanel(sched) {
  const dep = new Date(sched.departure_time).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  const arr = new Date(sched.arrival_time).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  openSidePanel({
    title: "Schedule Details",
    subtitle: routeName(sched.route_id),
    body: `
      <div class="assign-route-info">
        <div class="assign-info-row"><span class="assign-label">Route</span><span class="assign-value">${routeName(sched.route_id)}</span></div>
        <div class="assign-info-row"><span class="assign-label">Vehicle</span><span class="assign-value">${vehicleName(sched.vehicle_id)}</span></div>
        <div class="assign-info-row"><span class="assign-label">Driver</span><span class="assign-value">${driverName(sched.driver_id)}</span></div>
        <div class="assign-info-row"><span class="assign-label">Departure</span><span class="assign-value">${dep}</span></div>
        <div class="assign-info-row"><span class="assign-label">Arrival</span><span class="assign-value">${arr}</span></div>
        <div class="assign-info-row">
          <span class="assign-label">Status</span>
          <span class="assign-value">
            <span class="badge ${sched.status}">${sched.status}</span>
            ${sched.emergency_update ? `<span class="badge emergency" style="margin-left:4px">!</span>` : ""}
          </span>
        </div>
        ${sched.notes ? `<div class="assign-info-row"><span class="assign-label">Notes</span><span class="assign-value">${sched.notes}</span></div>` : ""}
      </div>
    `,
    footer: `<button class="ghost-btn" id="view-close-btn" type="button">Close</button>`,
  });
  document.getElementById("view-close-btn").addEventListener("click", closeSidePanel);
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

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
  _currentStatusFilter = document.getElementById("status-filter")?.value || "";
  _dateFrom = document.getElementById("date-from-filter")?.value || "";
  _dateTo = document.getElementById("date-to-filter")?.value || "";
  await loadPage();
}

async function clearFilter() {
  _currentStatusFilter = "";
  _dateFrom = "";
  _dateTo = "";
  await loadPage();
}

// ── Schedule form panel ───────────────────────────────────────────────────────

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
          <input name="departure_time" type="datetime-local"
            value="${v("departure_time") ? toLocalDatetime(v("departure_time")) : ""}" required>
        </div>
        <div class="field">
          <label>Arrival</label>
          <input name="arrival_time" type="datetime-local"
            value="${v("arrival_time") ? toLocalDatetime(v("arrival_time")) : ""}" required>
        </div>
      </div>
      ${sched ? `
        <div class="field">
          <label>Status</label>
          <select name="status">
            <option value="scheduled" ${sel("status", "scheduled")}>Scheduled</option>
            <option value="active"    ${sel("status", "active")}>Active</option>
            <option value="completed" ${sel("status", "completed")}>Completed</option>
            <option value="cancelled" ${sel("status", "cancelled")}>Cancelled</option>
            <option value="delayed"   ${sel("status", "delayed")}>Delayed</option>
            <option value="emergency" ${sel("status", "emergency")}>Emergency</option>
          </select>
        </div>
      ` : ""}
      <div class="field">
        <label>Notes (optional)</label>
        <input name="notes" type="text" maxlength="500" value="${v("notes") || ""}">
      </div>
      ${!sched ? `
        <div class="field">
          <label class="recurring-toggle-label">
            <input type="checkbox" id="recurring-toggle">
            <span>Repeat this schedule</span>
          </label>
        </div>
        <div id="recurring-options" class="recurring-section" style="display:none">
          <div class="field">
            <label>Recurrence Pattern</label>
            <select name="recurrence" id="recurrence-pattern">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly (same day each month)</option>
            </select>
          </div>
          <div class="field" id="recurrence-days-field" style="display:none">
            <label>Days of Week</label>
            <div class="weekday-checkboxes">
              ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, i) => `
                <label class="weekday-chip">
                  <input type="checkbox" name="recurrence_day" value="${i}">
                  <span>${day}</span>
                </label>
              `).join("")}
            </div>
          </div>
          <div class="field">
            <label>Repeat Until</label>
            <input type="date" name="repeat_until" id="repeat-until">
          </div>
        </div>
      ` : ""}
      <div id="conflict-warning" class="error-text" style="display:none"></div>
      ${renderInlineError("schedule-form-error")}
    </form>
  `;
}

function openSchedulePanel(sched = null) {
  editingId = sched?.id || null;
  openSidePanel({
    title: sched ? "Edit Schedule" : "New Schedule",
    subtitle: sched ? "Editing schedule entry" : "Plan a new trip assignment.",
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

  if (!sched) {
    document.getElementById("recurring-toggle").addEventListener("change", (e) => {
      document.getElementById("recurring-options").style.display = e.target.checked ? "" : "none";
      document.getElementById("schedule-panel-submit").textContent =
        e.target.checked ? "Create Recurring Schedules" : "Create Schedule";
    });
    document.getElementById("recurrence-pattern").addEventListener("change", (e) => {
      document.getElementById("recurrence-days-field").style.display =
        e.target.value === "weekly" ? "" : "none";
    });
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
    const result = await apiRequest("/schedules/conflicts", {
      method: "POST",
      headers: authHeaders(_token),
      body: JSON.stringify(payload),
    });
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
  const formData = new FormData(form);
  const payload = buildPayload(formData);
  try { validatePayload(payload); } catch (e) { errorNode.textContent = e.message; return; }

  const isRecurring = !editingId && document.getElementById("recurring-toggle")?.checked;

  if (isRecurring) {
    const recurrence = formData.get("recurrence");
    const repeatUntil = formData.get("repeat_until");
    const recurrenceDays =
      recurrence === "weekly"
        ? [...form.querySelectorAll('[name="recurrence_day"]:checked')].map((el) => parseInt(el.value))
        : [];

    if (!repeatUntil) { errorNode.textContent = "Please set a Repeat Until date."; return; }
    if (recurrence === "weekly" && recurrenceDays.length === 0) {
      errorNode.textContent = "Please select at least one day of the week.";
      return;
    }

    payload.status = "scheduled";
    payload.recurrence = recurrence;
    payload.recurrence_days = recurrenceDays;
    payload.repeat_until = repeatUntil;

    showLoader("Creating Recurring Schedules…");
    try {
      const result = await apiRequest("/schedules/recurring", {
        method: "POST",
        headers: authHeaders(_token),
        body: JSON.stringify(payload),
      });
      closeSidePanel();
      await loadPage();
      if (result.skipped > 0) {
        showToast(`${result.created} schedule(s) created. ${result.skipped} skipped (conflicts).`, "info");
      } else {
        showToast(`${result.created} recurring schedule(s) created.`);
      }
    } catch (error) {
      hideLoader();
      errorNode.textContent = error.message;
    }
    return;
  }

  showLoader(editingId ? "Updating Schedule…" : "Creating Schedule…");
  try {
    if (editingId) {
      payload.status = formData.get("status");
      await apiRequest(`/schedules/${editingId}`, {
        method: "PATCH",
        headers: authHeaders(_token),
        body: JSON.stringify(payload),
      });
      showToast("Schedule updated.");
    } else {
      payload.status = "scheduled";
      await apiRequest("/schedules", {
        method: "POST",
        headers: authHeaders(_token),
        body: JSON.stringify(payload),
      });
      showToast("Schedule created.");
    }
    closeSidePanel();
    await loadPage();
  } catch (error) {
    hideLoader();
    errorNode.textContent = error.message;
  }
}

function toLocalDatetime(isoString) {
  const d = new Date(isoString);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
