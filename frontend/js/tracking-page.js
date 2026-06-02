import { apiRequest } from "./api.js";
import { renderShellLayout, showToast, showLoader, hideLoader } from "./components.js";
import { authHeaders, fetchCurrentUser, logout } from "./page-utils.js";

let _container, _token;
let _map = null;
let _vehicleMarkers = {};   // vehicle_id → L.Marker
let _routeLines = {};       // vehicle_id → L.Polyline
let _firebaseUnsub = null;  // Firebase listener unsubscribe
let _pollTimer = null;
let _vehicleIndex = {};     // vehicle_id → vehicle info
let _routeIndex = {};       // route_id → route info
let _scheduleIndex = {};    // vehicle_id → schedule

export async function mount(container, token) {
  _container = container;
  _token = token;
  _cleanup();
  await loadPage();
}

function _cleanup() {
  if (_firebaseUnsub) { _firebaseUnsub(); _firebaseUnsub = null; }
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  if (_map) { _map.remove(); _map = null; }
  _vehicleMarkers = {};
  _routeLines = {};
}

async function loadPage() {
  showLoader("Loading Tracking…");
  try {
    const [user, vehicles, routes, schedules, fbConfig] = await Promise.all([
      fetchCurrentUser(_token),
      apiRequest("/vehicles", { headers: authHeaders(_token) }),
      apiRequest("/routes", { headers: authHeaders(_token) }),
      apiRequest("/schedules?status=active", { headers: authHeaders(_token) }).catch(() => []),
      fetch("/api/firebase-config").then(r => r.json()),
    ]);

    // Build lookup indexes
    _vehicleIndex = Object.fromEntries(vehicles.map(v => [v.id, v]));
    _routeIndex = Object.fromEntries(routes.map(r => [r.id, r]));
    _scheduleIndex = {};
    schedules.forEach(s => { _scheduleIndex[s.vehicle_id] = s; });

    render(user, vehicles, schedules);
    initMap();
    startLiveUpdates(fbConfig);
  } catch (e) {
    showToast("Failed to load tracking data.", "error");
    console.error(e);
  } finally {
    hideLoader();
  }
}

// ── Layout ───────────────────────────────────────────────────────────────────

function render(user, vehicles, schedules) {
  const activeCount = schedules.length;
  const fleetCount = vehicles.filter(v => v.active).length;

  _container.innerHTML = renderShellLayout({
    user,
    activeNav: "tracking",
    title: "Live Tracking",
    subtitle: "Real-time vehicle positions across the depot network.",
    content: `
      <div class="tracking-content">
        <aside class="tracking-sidebar">
          <div class="tracking-stats-bar">
            <div class="tracking-stat">
              <span class="tracking-stat-value" id="stat-active">${activeCount}</span>
              <span class="tracking-stat-label">Active Runs</span>
            </div>
            <div class="tracking-stat">
              <span class="tracking-stat-value" id="stat-reporting">0</span>
              <span class="tracking-stat-label">GPS Reporting</span>
            </div>
            <div class="tracking-stat">
              <span class="tracking-stat-value">${fleetCount}</span>
              <span class="tracking-stat-label">Fleet Size</span>
            </div>
          </div>

          <div class="tracking-legend">
            <span class="tracking-legend-item"><i class="tleg tleg-active"></i>Active</span>
            <span class="tracking-legend-item"><i class="tleg tleg-delayed"></i>Delayed</span>
            <span class="tracking-legend-item"><i class="tleg tleg-emergency"></i>Emergency</span>
            <span class="tracking-legend-item"><i class="tleg tleg-idle"></i>No signal</span>
          </div>

          <div class="tracking-vehicle-list" id="tracking-vehicle-list">
            ${schedules.length === 0
              ? `<p class="tracking-empty">No active schedules right now.</p>`
              : schedules.map(s => renderVehicleCard(s)).join("")}
          </div>

          <div class="tracking-tracker-link">
            <a href="/frontend/tracker.html" target="_blank" class="ghost-btn tracker-link-btn">
              📍 Open Driver Tracker
            </a>
          </div>
        </aside>

        <div class="tracking-map-wrap">
          <div id="tracking-map"></div>
          <div class="tracking-map-hint" id="tracking-map-hint">
            Waiting for GPS data…
          </div>
        </div>
      </div>
    `,
  });

  document.getElementById("logout-btn").addEventListener("click", () => {
    _cleanup();
    logout(_token);
  });

  document.querySelectorAll("[data-focus-vehicle]").forEach(el => {
    el.addEventListener("click", () => focusVehicle(el.dataset.focusVehicle));
  });
}

function renderVehicleCard(schedule) {
  const vehicle = _vehicleIndex[schedule.vehicle_id];
  const route = _routeIndex[schedule.route_id];
  return `
    <div class="tracking-vehicle-card" id="vcard-${schedule.vehicle_id}" data-focus-vehicle="${schedule.vehicle_id}">
      <div class="vcard-header">
        <span class="vcard-fleet">${vehicle?.fleet_number ?? "—"}</span>
        <span class="badge ${schedule.status}">${schedule.status}</span>
      </div>
      <div class="vcard-detail">
        <span>${vehicle?.registration_no ?? ""}</span>
        <span class="vcard-route">${route?.route_name ?? "—"}</span>
      </div>
      <div class="vcard-gps" id="vgps-${schedule.vehicle_id}">
        <span class="vcard-no-signal">No GPS signal</span>
      </div>
    </div>
  `;
}

// ── Leaflet map ──────────────────────────────────────────────────────────────

function initMap() {
  const container = document.getElementById("tracking-map");
  if (!container || typeof L === "undefined") return;

  _map = L.map("tracking-map");
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(_map);

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => _map?.setView([pos.coords.latitude, pos.coords.longitude], 12),
      () => _map?.setView([20, 0], 3)
    );
  } else {
    _map.setView([20, 0], 3);
  }
}

function createVehicleIcon(schedule) {
  const cls = `tpin-${schedule?.status ?? "idle"}`;
  const vehicle = _vehicleIndex[schedule?.vehicle_id];
  const label = vehicle?.fleet_number?.slice(0, 4) ?? "?";
  return L.divIcon({
    className: "",
    html: `<div class="tracking-pin ${cls}"><span>${label}</span></div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -22],
  });
}

function buildPopupHTML(vehicleId, location) {
  const vehicle = _vehicleIndex[vehicleId];
  const schedule = _scheduleIndex[vehicleId];
  const route = schedule ? _routeIndex[schedule.route_id] : null;
  const speed = location.speed_kmh != null ? `${location.speed_kmh.toFixed(1)} km/h` : "—";
  const updated = location.updated_at
    ? new Date(location.updated_at).toLocaleTimeString()
    : "—";
  return `
    <div class="tracking-popup">
      <strong>${vehicle?.fleet_number ?? vehicleId}</strong>
      <span>${vehicle?.registration_no ?? ""}</span>
      <hr>
      <span>Route: ${route?.route_name ?? "—"}</span>
      <span>Speed: ${speed}</span>
      <span>Updated: ${updated}</span>
    </div>
  `;
}

function placeOrMoveMarker(vehicleId, location) {
  const schedule = _scheduleIndex[vehicleId];
  const latlng = [location.latitude, location.longitude];

  if (_vehicleMarkers[vehicleId]) {
    _vehicleMarkers[vehicleId]
      .setLatLng(latlng)
      .setIcon(createVehicleIcon(schedule))
      .setPopupContent(buildPopupHTML(vehicleId, location));
  } else {
    const marker = L.marker(latlng, { icon: createVehicleIcon(schedule) })
      .bindPopup(buildPopupHTML(vehicleId, location))
      .addTo(_map);
    _vehicleMarkers[vehicleId] = marker;

    // Draw route polyline if the vehicle's route has geo points
    if (schedule) {
      const route = _routeIndex[schedule.route_id];
      if (route?.path_points?.length >= 2 && !_routeLines[vehicleId]) {
        _routeLines[vehicleId] = L.polyline(route.path_points, {
          color: "#6366f1", weight: 3, opacity: 0.5, dashArray: "6 4",
        }).addTo(_map);
      }
    }
  }
}

function focusVehicle(vehicleId) {
  const marker = _vehicleMarkers[vehicleId];
  if (marker) {
    _map.setView(marker.getLatLng(), 15);
    marker.openPopup();
  }
}

// ── Live updates (Firebase or polling) ───────────────────────────────────────

async function startLiveUpdates(fbConfig) {
  if (fbConfig.mode === "firebase") {
    await startFirebaseUpdates(fbConfig);
  } else {
    startPolling();
  }
}

async function startFirebaseUpdates(fbConfig) {
  if (typeof firebase === "undefined") {
    showToast("Firebase SDK not loaded, falling back to polling.", "info");
    startPolling();
    return;
  }
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(fbConfig);
    }
    const db = firebase.database();
    const ref = db.ref("vehicle_locations");
    ref.on("value", snapshot => {
      const locations = snapshot.val() || {};
      applyLocationUpdates(locations);
    });
    _firebaseUnsub = () => ref.off("value");
  } catch (e) {
    console.error("Firebase init failed:", e);
    startPolling();
  }
}

function startPolling() {
  const poll = async () => {
    try {
      const locations = await apiRequest("/tracking", { headers: authHeaders(_token) });
      const loc = Object.fromEntries(locations.map(l => [l.vehicle_id, l]));
      applyLocationUpdates(loc);
    } catch { /* silent */ }
  };
  poll();
  _pollTimer = setInterval(poll, 5000);
}

function applyLocationUpdates(locations) {
  const hint = document.getElementById("tracking-map-hint");
  const reporting = Object.keys(locations).length;

  document.getElementById("stat-reporting").textContent = reporting;
  if (hint) hint.style.display = reporting > 0 ? "none" : "";

  Object.entries(locations).forEach(([vehicleId, loc]) => {
    if (!_map) return;
    placeOrMoveMarker(vehicleId, loc);
    updateVehicleCard(vehicleId, loc);
  });
}

function updateVehicleCard(vehicleId, location) {
  const gpsEl = document.getElementById(`vgps-${vehicleId}`);
  if (!gpsEl) return;
  const speed = location.speed_kmh != null ? `${location.speed_kmh.toFixed(1)} km/h` : "—";
  const updated = location.updated_at
    ? new Date(location.updated_at).toLocaleTimeString()
    : "";
  gpsEl.innerHTML = `
    <span class="vcard-speed">🚌 ${speed}</span>
    <span class="vcard-time">${updated}</span>
  `;
}
