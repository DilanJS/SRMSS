import { apiRequest } from "./api.js";
import { renderEntityTable, renderFilters, renderInlineError, renderManagementPage, renderPagination, showConfirm, showToast, showLoader, hideLoader, openSidePanel, closeSidePanel } from "./components.js";
import { authHeaders, fetchCurrentUser, logout } from "./page-utils.js";

const PAGE_SIZE = 15;

let _container, _token, _role;
let editingId = null;
let _vehicles = [];
let _drivers = [];
let _page = 1, _totalPages = 1, _total = 0, _summary = {};
let _searchQuery = "";

// Intermediate stops state
let _stops = [];

// Map state
let _map = null;
let _startMarker = null;
let _endMarker = null;
let _stopMarkers = [];
let _routePolyline = null;
let _mapClickMode = "start";
let _startCoords = null;
let _endCoords = null;

export async function mount(container, token) {
  _container = container;
  _token = token;
  _role = null;
  editingId = null;
  _page = 1;
  _searchQuery = "";
  await loadPage();
}

const isAdmin = () => _role === "admin";
const canManage = () => _role === "admin" || _role === "manager";

async function loadPage() {
  showLoader("Loading Routes…");
  try {
    const user = await fetchCurrentUser(_token);
    _role = user.role;
    const routeParams = new URLSearchParams({ page: _page, page_size: PAGE_SIZE });
    if (_searchQuery) routeParams.set("search", _searchQuery);
    const [routeResult, vehiclesResult, driversResult] = await Promise.all([
      apiRequest(`/routes?${routeParams}`, { headers: authHeaders(_token) }),
      apiRequest("/vehicles?page=1&page_size=1000", { headers: authHeaders(_token) }),
      apiRequest("/drivers?page=1&page_size=1000", { headers: authHeaders(_token) }),
    ]);
    _total = routeResult.total;
    _totalPages = routeResult.total_pages;
    _page = routeResult.page;
    _summary = routeResult.summary;
    _vehicles = vehiclesResult.items;
    _drivers = driversResult.items;
    render(user, routeResult.items);
  } finally {
    hideLoader();
  }
}

function render(user, routes) {
  _container.innerHTML = renderManagementPage({
    user,
    activeNav: "routes",
    title: "Route Management",
    subtitle: "Define, review, and refine route coverage for depot operations.",
    statsCards: [
      { label: "Total Routes", value: _total },
      { label: "Active Routes", value: _summary.active ?? 0 },
      { label: "Inactive Routes", value: _summary.inactive ?? 0 },
      { label: "Express Routes", value: _summary.express ?? 0 },
      { label: "City Routes", value: _summary.city ?? 0 },
    ],
    filterMarkup: renderFilters(`
      <input class="filter-input" id="route-search" placeholder="Search route code or name" value="${_searchQuery}">
      <button class="ghost-btn" id="route-search-btn" type="button">Search</button>
      ${isAdmin() ? `<button class="primary-btn" id="create-route-btn" type="button">+ New Route</button>` : ""}
    `),
    tableTitle: "Routes",
    tableMarkup: renderEntityTable({
      columns: ["Code", "Name", "Service", "Stops", "Distance", "Status", "Assignment", "Actions"],
      rows: routes.map((route) => {
        const assignedVehicle = route.assigned_vehicle_id ? _vehicles.find(v => v.id === route.assigned_vehicle_id) : null;
        const assignedDriver = route.assigned_driver_id ? _drivers.find(d => d.id === route.assigned_driver_id) : null;
        const assignmentCell = (assignedVehicle || assignedDriver)
          ? `<div class="assignment-cell">
               ${assignedVehicle ? `<span class="assignment-vehicle">${assignedVehicle.fleet_number}</span>` : ""}
               ${assignedDriver ? `<span class="assignment-driver">${assignedDriver.full_name}</span>` : ""}
             </div>`
          : `<span class="badge inactive">Unassigned</span>`;
        return `
          <tr>
            <td>${route.route_code}</td>
            <td>${route.route_name}</td>
            <td>${route.service_type}</td>
            <td>${route.stops?.length ?? 0}</td>
            <td>${route.distance_km} km</td>
            <td><span class="badge ${route.active ? "active" : "inactive"}">${route.active ? "active" : "inactive"}</span></td>
            <td>${assignmentCell}</td>
            <td><div class="table-actions">
              ${canManage() ? `<button class="table-btn" data-route-assign="${route.id}">Assign</button>` : ""}
              ${isAdmin() ? `<button class="table-btn" data-route-edit="${route.id}">Edit</button>` : ""}
              ${isAdmin() ? `<button class="table-btn danger-btn" data-route-delete="${route.id}" data-route-code="${route.route_code}">Delete</button>` : ""}
            </div></td>
          </tr>
        `;
      }),
      emptyMessage: "No routes yet. Click + New Route to create one.",
    }) + renderPagination({ page: _page, totalPages: _totalPages, total: _total, pageSize: PAGE_SIZE }),
  });

  bindActions();
}

// ── Form HTML ────────────────────────────────────────────────────────────────

function buildFormHTML(route = null) {
  _stops = route?.stops
    ? [...route.stops]
        .sort((a, b) => a.sequence - b.sequence)
        .map(s => ({ name: s.name, latitude: s.latitude ?? null, longitude: s.longitude ?? null }))
    : [];

  const v = (field) => route ? (route[field] ?? "") : "";
  return `
    <form id="route-form" class="form-grid">
      <div class="field">
        <label>Route Code</label>
        <input name="route_code" value="${v("route_code")}" placeholder="e.g. R-101" required>
      </div>
      <div class="field">
        <label>Route Name</label>
        <input name="route_name" value="${v("route_name")}" placeholder="e.g. City Centre Loop" required>
      </div>

      <div class="field route-map-field">
        <label>Route Map <span class="map-hint-inline">— click to place start, stops, and end</span></label>
        <div class="map-mode-toolbar">
          <button type="button" class="map-mode-btn active" data-mode="start">
            <span class="map-mode-dot map-mode-dot-start"></span>Set Start
          </button>
          <button type="button" class="map-mode-btn" data-mode="stop">
            <span class="map-mode-dot map-mode-dot-stop"></span>Add Stop
          </button>
          <button type="button" class="map-mode-btn" data-mode="end">
            <span class="map-mode-dot map-mode-dot-end"></span>Set End
          </button>
        </div>
        <div id="route-map"></div>
      </div>

      <div class="field">
        <label>Start Point</label>
        <input name="start_point" value="${v("start_point")}" placeholder="e.g. Central Bus Terminal" required>
      </div>
      <div class="field">
        <label>Intermediate Stops</label>
        <div id="stops-list"></div>
        <button type="button" id="add-stop-btn" class="ghost-btn add-stop-btn">+ Add Stop</button>
      </div>
      <div class="field">
        <label>End Point</label>
        <input name="end_point" value="${v("end_point")}" placeholder="e.g. Airport Junction" required>
      </div>

      <div class="split-grid">
        <div class="field">
          <label>Distance (km)</label>
          <input name="distance_km" type="number" step="0.1" min="0" value="${v("distance_km")}" required>
        </div>
        <div class="field">
          <label>Duration (min)</label>
          <input name="estimated_duration_minutes" type="number" min="1" value="${v("estimated_duration_minutes")}" required>
        </div>
      </div>
      <div class="field">
        <label>Service Type</label>
        <select name="service_type">
          ${["city", "suburban", "express", "intercity", "school", "special"].map((t) =>
            `<option value="${t}" ${v("service_type") === t ? "selected" : ""}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`
          ).join("")}
        </select>
      </div>
      ${route ? `
        <div class="field">
          <label>Status</label>
          <select name="active">
            <option value="true" ${route.active ? "selected" : ""}>Active</option>
            <option value="false" ${!route.active ? "selected" : ""}>Inactive</option>
          </select>
        </div>
      ` : ""}
      ${renderInlineError("route-form-error")}
    </form>
  `;
}

// ── Stops list (text) ────────────────────────────────────────────────────────

function renderStopsList() {
  const container = document.getElementById("stops-list");
  if (!container) return;

  if (_stops.length === 0) {
    container.innerHTML = `<p class="stops-empty-note">No intermediate stops. Click "+ Add Stop" or use the map.</p>`;
    syncStopMarkersWithMap();
    return;
  }

  container.innerHTML = _stops.map((stop, i) => `
    <div class="stop-row">
      <span class="stop-seq">${i + 1}.</span>
      <input type="text" class="stop-name-input" data-idx="${i}" value="${stop.name}" placeholder="Stop name">
      <button type="button" class="ghost-btn stop-remove-btn" data-idx="${i}" title="Remove stop">✕</button>
    </div>
  `).join("");

  container.querySelectorAll(".stop-name-input").forEach(input => {
    input.addEventListener("input", e => {
      _stops[parseInt(e.target.dataset.idx)].name = e.target.value;
    });
  });

  container.querySelectorAll(".stop-remove-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      _stops.splice(parseInt(e.target.dataset.idx), 1);
      renderStopsList();
    });
  });

  syncStopMarkersWithMap();
}

// ── Leaflet map ──────────────────────────────────────────────────────────────

function initRouteMap(route) {
  if (_map) { _map.remove(); _map = null; }
  _startMarker = null;
  _endMarker = null;
  _stopMarkers = [];
  _routePolyline = null;
  _startCoords = null;
  _endCoords = null;
  _mapClickMode = "start";

  const container = document.getElementById("route-map");
  if (!container || typeof L === "undefined") return;

  _map = L.map("route-map", { zoomControl: true });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(_map);

  const bounds = [];

  if (route) {
    if (route.start_latitude != null && route.start_longitude != null) {
      _startCoords = { lat: route.start_latitude, lng: route.start_longitude };
      _startMarker = createRouteMarker(_startCoords.lat, _startCoords.lng, "start", "S").addTo(_map);
      bounds.push([_startCoords.lat, _startCoords.lng]);
    }

    _stops.forEach((stop, i) => {
      if (stop.latitude != null && stop.longitude != null) {
        const m = createRouteMarker(stop.latitude, stop.longitude, "stop", i + 1).addTo(_map);
        _stopMarkers.push(m);
        bounds.push([stop.latitude, stop.longitude]);
      } else {
        _stopMarkers.push(null);
      }
    });

    if (route.end_latitude != null && route.end_longitude != null) {
      _endCoords = { lat: route.end_latitude, lng: route.end_longitude };
      _endMarker = createRouteMarker(_endCoords.lat, _endCoords.lng, "end", "E").addTo(_map);
      bounds.push([_endCoords.lat, _endCoords.lng]);
    }

    if (bounds.length > 0) {
      _map.fitBounds(bounds, { padding: [40, 40] });
    } else {
      setDefaultMapView();
    }

    updateRoutePolyline();
  } else {
    setDefaultMapView();
  }

  _map.on("click", onMapClick);
}

function setDefaultMapView() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => _map?.setView([pos.coords.latitude, pos.coords.longitude], 13),
      () => _map?.setView([20, 0], 2)
    );
  } else {
    _map?.setView([20, 0], 2);
  }
}

function createRouteMarker(lat, lng, type, label) {
  const icon = L.divIcon({
    className: "",
    html: `<div class="route-map-pin route-map-pin-${type}"><span>${label}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -18],
  });
  return L.marker([lat, lng], { icon });
}

async function onMapClick(e) {
  const { lat, lng } = e.latlng;
  const name = await reverseGeocode(lat, lng);

  if (_mapClickMode === "start") {
    if (_startMarker) _startMarker.remove();
    _startMarker = createRouteMarker(lat, lng, "start", "S").addTo(_map);
    _startCoords = { lat, lng };
    const input = document.querySelector('#route-form input[name="start_point"]');
    if (input) input.value = name;

  } else if (_mapClickMode === "stop") {
    _stops.push({ name, latitude: lat, longitude: lng });
    renderStopsList();

  } else if (_mapClickMode === "end") {
    if (_endMarker) _endMarker.remove();
    _endMarker = createRouteMarker(lat, lng, "end", "E").addTo(_map);
    _endCoords = { lat, lng };
    const input = document.querySelector('#route-form input[name="end_point"]');
    if (input) input.value = name;
  }

  updateRoutePolyline();
}

function syncStopMarkersWithMap() {
  if (!_map) return;
  _stopMarkers.forEach(m => m && m.remove());
  _stopMarkers = [];
  _stops.forEach((stop, i) => {
    if (stop.latitude != null && stop.longitude != null) {
      const m = createRouteMarker(stop.latitude, stop.longitude, "stop", i + 1).addTo(_map);
      _stopMarkers.push(m);
    } else {
      _stopMarkers.push(null);
    }
  });
  updateRoutePolyline();
}

function updateRoutePolyline() {
  if (!_map) return;
  const points = [];
  if (_startCoords) points.push([_startCoords.lat, _startCoords.lng]);
  _stops.forEach(s => { if (s.latitude != null) points.push([s.latitude, s.longitude]); });
  if (_endCoords) points.push([_endCoords.lat, _endCoords.lng]);

  if (_routePolyline) {
    _routePolyline.setLatLngs(points);
  } else if (points.length >= 2) {
    _routePolyline = L.polyline(points, { color: "#6366f1", weight: 4, opacity: 0.85 }).addTo(_map);
  }
}

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await res.json();
    const a = data.address || {};
    const parts = [
      a.road || a.amenity || a.building || a.leisure,
      a.suburb || a.neighbourhood || a.town || a.city || a.county,
    ].filter(Boolean);
    return parts.length
      ? parts.join(", ")
      : (data.display_name?.split(",").slice(0, 2).join(", ") || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

function bindMapModeButtons() {
  document.querySelectorAll(".map-mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      _mapClickMode = btn.dataset.mode;
      document.querySelectorAll(".map-mode-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });
}

// ── Panel open/close ─────────────────────────────────────────────────────────

function destroyMap() {
  if (_map) { _map.remove(); _map = null; }
}

function openRoutePanel(route = null) {
  editingId = route?.id || null;

  openSidePanel({
    title: route ? "Edit Route" : "New Route",
    subtitle: route ? `Editing ${route.route_code}` : "Fill in the details to create a new route.",
    body: buildFormHTML(route),
    footer: `
      <button class="primary-btn" id="route-panel-submit" type="button">
        ${route ? "Save Changes" : "Create Route"}
      </button>
      <button class="ghost-btn" type="button" id="route-panel-cancel">Cancel</button>
    `,
  });

  renderStopsList();
  bindMapModeButtons();

  // Init map after panel is in the DOM (animation needs a moment)
  setTimeout(() => {
    initRouteMap(route);
    setTimeout(() => _map?.invalidateSize(), 300);
  }, 60);

  document.getElementById("add-stop-btn").addEventListener("click", () => {
    _stops.push({ name: "", latitude: null, longitude: null });
    renderStopsList();
  });

  document.getElementById("route-panel-submit").addEventListener("click", submitRouteForm);
  document.getElementById("route-panel-cancel").addEventListener("click", () => {
    destroyMap();
    closeSidePanel();
  });
}

// ── Table actions ────────────────────────────────────────────────────────────

function bindActions() {
  document.getElementById("logout-btn").addEventListener("click", () => logout(_token));
  document.getElementById("create-route-btn")?.addEventListener("click", () => openRoutePanel());
  document.getElementById("route-search-btn").addEventListener("click", applyRouteSearch);

  document.querySelectorAll("[data-route-assign]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      showLoader("Loading Route…");
      try {
        const route = await apiRequest(`/routes/${btn.dataset.routeAssign}`, { headers: authHeaders(_token) });
        openAssignPanel(route);
      } catch {
        showToast("Could not load route data.", "error");
      } finally {
        hideLoader();
      }
    });
  });

  document.querySelectorAll("[data-route-edit]").forEach((btn) => {
    btn.addEventListener("click", () => startEdit(btn.dataset.routeEdit));
  });

  document.querySelectorAll("[data-route-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      showConfirm({
        title: "Delete Route",
        message: `Delete route <strong>${btn.dataset.routeCode}</strong>? This cannot be undone.`,
        onConfirm: () => deleteRoute(btn.dataset.routeDelete),
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
  showLoader("Loading Route…");
  try {
    const route = await apiRequest(`/routes/${id}`, { headers: authHeaders(_token) });
    openRoutePanel(route);
  } catch {
    showToast("Could not load route data.", "error");
  } finally {
    hideLoader();
  }
}

// ── Submit ───────────────────────────────────────────────────────────────────

async function submitRouteForm() {
  const errorNode = document.getElementById("route-form-error");
  errorNode.textContent = "";
  const form = document.getElementById("route-form");
  if (!form.checkValidity()) { form.reportValidity(); return; }

  const invalidStop = _stops.find(s => !s.name.trim());
  if (invalidStop) {
    errorNode.textContent = "All intermediate stops must have a name.";
    return;
  }

  const formData = new FormData(form);
  const stops = _stops.map((s, i) => ({
    name: s.name.trim(),
    sequence: i + 1,
    latitude: s.latitude,
    longitude: s.longitude,
  }));

  const payload = {
    route_code: formData.get("route_code"),
    route_name: formData.get("route_name"),
    start_point: formData.get("start_point"),
    start_latitude: _startCoords?.lat ?? null,
    start_longitude: _startCoords?.lng ?? null,
    end_point: formData.get("end_point"),
    end_latitude: _endCoords?.lat ?? null,
    end_longitude: _endCoords?.lng ?? null,
    distance_km: Number(formData.get("distance_km")),
    estimated_duration_minutes: Number(formData.get("estimated_duration_minutes")),
    service_type: formData.get("service_type"),
    stops,
  };

  showLoader(editingId ? "Updating Route…" : "Creating Route…");
  try {
    if (editingId) {
      payload.active = formData.get("active") === "true";
      await apiRequest(`/routes/${editingId}`, { method: "PATCH", headers: authHeaders(_token), body: JSON.stringify(payload) });
      showToast("Route updated successfully.");
    } else {
      payload.active = true;
      payload.path_points = [];
      await apiRequest("/routes", { method: "POST", headers: authHeaders(_token), body: JSON.stringify(payload) });
      showToast("Route created successfully.");
    }
    destroyMap();
    closeSidePanel();
    await loadPage();
  } catch (error) {
    hideLoader();
    errorNode.textContent = error.message;
  }
}

// ── Assignment panel ─────────────────────────────────────────────────────────

function buildAssignFormHTML(route) {
  const availableVehicles = _vehicles.filter(v =>
    v.active && (v.status === "available" || v.id === route.assigned_vehicle_id)
  );
  const availableDrivers = _drivers.filter(d =>
    d.active && (d.status === "available" || d.id === route.assigned_driver_id)
  );

  const assignedVehicle = route.assigned_vehicle_id ? _vehicles.find(v => v.id === route.assigned_vehicle_id) : null;
  const assignedDriver = route.assigned_driver_id ? _drivers.find(d => d.id === route.assigned_driver_id) : null;
  const isAssigned = assignedVehicle || assignedDriver;

  return `
    <div class="assign-route-info">
      <div class="assign-info-row">
        <span class="assign-label">Route</span>
        <span class="assign-value">${route.route_code} — ${route.route_name}</span>
      </div>
      <div class="assign-info-row">
        <span class="assign-label">Service Type</span>
        <span class="assign-value">${route.service_type}</span>
      </div>
      <div class="assign-info-row">
        <span class="assign-label">Distance</span>
        <span class="assign-value">${route.stops?.length ?? 0} stops · ${route.distance_km} km</span>
      </div>
    </div>

    ${isAssigned ? `
      <div class="current-assignment-banner">
        <div class="current-assign-title">Current Assignment</div>
        <div class="current-assign-detail">
          ${assignedVehicle
            ? `Vehicle: <strong>${assignedVehicle.fleet_number}</strong> (${assignedVehicle.model}) · ${assignedVehicle.capacity} seats`
            : "No vehicle assigned"}
        </div>
        <div class="current-assign-detail">
          ${assignedDriver
            ? `Driver: <strong>${assignedDriver.full_name}</strong> (${assignedDriver.employee_no})`
            : "No driver assigned"}
        </div>
      </div>
    ` : ""}

    <form id="assign-form" class="form-grid">
      <div class="field">
        <label>Vehicle <span class="assign-field-hint">— available vehicles shown</span></label>
        ${availableVehicles.length === 0
          ? `<p class="assign-empty-note">No available vehicles. Release a vehicle from its current route first.</p>`
          : `<select name="vehicle_id" required>
              <option value="">— Select Vehicle —</option>
              ${availableVehicles.map(v => `
                <option value="${v.id}" ${v.id === route.assigned_vehicle_id ? "selected" : ""}>
                  ${v.fleet_number} · ${v.model} · ${v.capacity} seats
                </option>
              `).join("")}
            </select>`
        }
      </div>
      <div class="field">
        <label>Driver <span class="assign-field-hint">— available drivers shown</span></label>
        ${availableDrivers.length === 0
          ? `<p class="assign-empty-note">No available drivers. Release a driver from their current assignment first.</p>`
          : `<select name="driver_id" required>
              <option value="">— Select Driver —</option>
              ${availableDrivers.map(d => `
                <option value="${d.id}" ${d.id === route.assigned_driver_id ? "selected" : ""}>
                  ${d.full_name} (${d.employee_no})
                </option>
              `).join("")}
            </select>`
        }
      </div>
      ${renderInlineError("assign-form-error")}
    </form>
  `;
}

function openAssignPanel(route) {
  const isAssigned = route.assigned_vehicle_id || route.assigned_driver_id;

  openSidePanel({
    title: isAssigned ? "Update Assignment" : "Assign to Route",
    subtitle: `Route ${route.route_code}: ${route.route_name}`,
    body: buildAssignFormHTML(route),
    footer: `
      <button class="primary-btn" id="assign-panel-submit" type="button">
        ${isAssigned ? "Update Assignment" : "Assign"}
      </button>
      ${isAssigned
        ? `<button class="table-btn danger-btn" type="button" id="assign-panel-unassign">Unassign</button>`
        : ""}
      <button class="ghost-btn" type="button" id="assign-panel-cancel">Cancel</button>
    `,
  });

  document.getElementById("assign-panel-submit").addEventListener("click", () => submitAssign(route.id));
  document.getElementById("assign-panel-cancel").addEventListener("click", closeSidePanel);
  document.getElementById("assign-panel-unassign")?.addEventListener("click", () => {
    showConfirm({
      title: "Remove Assignment",
      message: `Remove the vehicle and driver assignment from route <strong>${route.route_code}</strong>?`,
      onConfirm: () => doUnassign(route.id),
    });
  });
}

async function submitAssign(routeId) {
  const errorNode = document.getElementById("assign-form-error");
  errorNode.textContent = "";

  const form = document.getElementById("assign-form");
  if (!form.checkValidity()) { form.reportValidity(); return; }

  const formData = new FormData(form);
  const payload = {
    vehicle_id: formData.get("vehicle_id"),
    driver_id: formData.get("driver_id"),
  };

  showLoader("Saving Assignment…");
  try {
    await apiRequest(`/routes/${routeId}/assign`, {
      method: "POST",
      headers: authHeaders(_token),
      body: JSON.stringify(payload),
    });
    showToast("Assignment saved successfully.");
    closeSidePanel();
    await loadPage();
  } catch (error) {
    hideLoader();
    errorNode.textContent = error.message;
  }
}

async function doUnassign(routeId) {
  showLoader("Removing Assignment…");
  try {
    await apiRequest(`/routes/${routeId}/assign`, {
      method: "DELETE",
      headers: authHeaders(_token),
    });
    showToast("Assignment removed.", "info");
    closeSidePanel();
    await loadPage();
  } catch (e) {
    hideLoader();
    showToast(e.message, "error");
  }
}

// ── Delete / search ──────────────────────────────────────────────────────────

async function deleteRoute(id) {
  showLoader("Deleting Route…");
  try {
    await apiRequest(`/routes/${id}`, { method: "DELETE", headers: authHeaders(_token) });
    showToast("Route deleted.", "info");
    await loadPage();
  } catch (e) {
    hideLoader();
    showToast(e.message, "error");
  }
}

async function applyRouteSearch() {
  _searchQuery = document.getElementById("route-search").value.trim();
  _page = 1;
  await loadPage();
}
