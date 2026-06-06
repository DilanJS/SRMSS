import { apiRequest } from "./api.js";
import { renderShellLayout, showToast } from "./components.js";
import { authHeaders, fetchCurrentUser, logout } from "./page-utils.js";

const REPORT_INTERVAL_MS = 8000;

let _container, _token, _user;
let _watchId = null;
let _reportTimer = null;
let _lastPosition = null;
let _vehicleId = null;
let _map = null;
let _marker = null;
let _tracking = false;

export async function mount(container, token) {
  _container = container;
  _token = token;
  _stopTracking();
  await loadPage();
}

async function loadPage() {
  try {
    const [user, vehiclesResult, schedulesResult] = await Promise.all([
      fetchCurrentUser(_token),
      apiRequest("/vehicles?page=1&page_size=1000", { headers: authHeaders(_token) }),
      apiRequest("/schedules?status=active&page=1&page_size=1000", { headers: authHeaders(_token) }).catch(() => ({ items: [] })),
    ]);
    _user = user;
    const vehicles = vehiclesResult.items;
    const schedules = schedulesResult.items;

    // Find vehicle assigned to this driver via active schedule
    const mySchedule = schedules.find(s => s.driver_id === user.id);
    const assignedVehicle = mySchedule
      ? vehicles.find(v => v.id === mySchedule.vehicle_id)
      : vehicles.find(v => v.assigned_driver_id === user.id);

    render(user, vehicles, assignedVehicle);
  } catch (e) {
    showToast("Failed to load tracker.", "error");
  }
}

// ── Layout ────────────────────────────────────────────────────────────────────

function render(user, vehicles, assignedVehicle) {
  _container.innerHTML = renderShellLayout({
    user,
    activeNav: "driver-tracker",
    title: "Start Tracking",
    subtitle: "Share your GPS location with the depot while on a run.",
    content: `
      <div class="driver-tracker-layout">

        <div class="driver-tracker-main">

          <!-- Vehicle select card -->
          <div class="dt-card" id="dt-select-card">
            <h3 class="dt-card-title">Your Vehicle</h3>
            ${assignedVehicle ? `
              <div class="dt-assigned-vehicle">
                <div class="dt-vehicle-info">
                  <span class="dt-fleet">${assignedVehicle.fleet_number}</span>
                  <span class="dt-reg">${assignedVehicle.registration_no} — ${assignedVehicle.manufacturer} ${assignedVehicle.model}</span>
                </div>
                <input type="hidden" id="vehicle-select" value="${assignedVehicle.id}">
                <p class="dt-assigned-note">Assigned from your active schedule.</p>
              </div>
            ` : `
              <div class="field">
                <label>Select Vehicle</label>
                <select id="vehicle-select">
                  <option value="">— Choose a vehicle —</option>
                  ${vehicles.filter(v => v.active).map(v =>
                    `<option value="${v.id}">${v.fleet_number} — ${v.registration_no}</option>`
                  ).join("")}
                </select>
              </div>
            `}

            <button class="primary-btn dt-start-btn" id="dt-start-btn">
              Start Tracking
            </button>
          </div>

          <!-- Status card (shown while tracking) -->
          <div class="dt-card dt-status-card" id="dt-status-card" style="display:none">
            <div class="dt-tracking-header">
              <div class="dt-pulse-wrap">
                <span class="dt-pulse-dot"></span>
                <span class="dt-tracking-label">Live — Reporting to Depot</span>
              </div>
              <button class="ghost-btn dt-stop-btn" id="dt-stop-btn">Stop</button>
            </div>

            <div class="dt-stats-grid">
              <div class="dt-stat">
                <span class="dt-stat-label">Speed</span>
                <span class="dt-stat-value" id="dt-speed">—</span>
              </div>
              <div class="dt-stat">
                <span class="dt-stat-label">Accuracy</span>
                <span class="dt-stat-value" id="dt-accuracy">Acquiring…</span>
              </div>
              <div class="dt-stat">
                <span class="dt-stat-label">Coordinates</span>
                <span class="dt-stat-value dt-coords" id="dt-coords">Acquiring…</span>
              </div>
              <div class="dt-stat">
                <span class="dt-stat-label">Last sent</span>
                <span class="dt-stat-value" id="dt-last-sent">—</span>
              </div>
            </div>
          </div>

          <!-- Mini map -->
          <div class="dt-card dt-map-card" id="dt-map-card" style="display:none">
            <div id="dt-mini-map"></div>
          </div>

        </div>
      </div>
    `,
  });

  document.getElementById("logout-btn").addEventListener("click", () => {
    _stopTracking();
    logout(_token);
  });
  document.getElementById("dt-start-btn").addEventListener("click", startTracking);
  document.getElementById("dt-stop-btn")?.addEventListener("click", () => {
    _stopTracking();
    showToast("Tracking stopped.", "info");
    // re-show the select card
    document.getElementById("dt-select-card").style.display = "block";
    document.getElementById("dt-status-card").style.display = "none";
    document.getElementById("dt-map-card").style.display = "none";
  });
}

// ── Tracking ──────────────────────────────────────────────────────────────────

function startTracking() {
  const sel = document.getElementById("vehicle-select");
  _vehicleId = sel.tagName === "SELECT" ? sel.value : sel.value;

  if (!_vehicleId) {
    showToast("Please select a vehicle first.", "error");
    return;
  }
  if (!navigator.geolocation) {
    showToast("GPS is not available on this device.", "error");
    return;
  }

  _tracking = true;
  document.getElementById("dt-select-card").style.display = "none";
  document.getElementById("dt-status-card").style.display = "block";
  document.getElementById("dt-map-card").style.display = "block";

  _initMiniMap();

  _watchId = navigator.geolocation.watchPosition(
    _onPositionUpdate,
    _onPositionError,
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );

  _reportTimer = setInterval(_sendLocation, REPORT_INTERVAL_MS);
}

function _stopTracking() {
  if (_watchId != null) { navigator.geolocation.clearWatch(_watchId); _watchId = null; }
  if (_reportTimer) { clearInterval(_reportTimer); _reportTimer = null; }
  if (_map) { _map.remove(); _map = null; _marker = null; }
  _lastPosition = null;
  _tracking = false;
  _vehicleId = null;
}

function _onPositionUpdate(pos) {
  _lastPosition = pos;
  const { latitude, longitude, accuracy, speed } = pos.coords;

  const coordsEl = document.getElementById("dt-coords");
  const accEl = document.getElementById("dt-accuracy");
  const speedEl = document.getElementById("dt-speed");
  if (!coordsEl) return;

  coordsEl.textContent = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  accEl.textContent = `${Math.round(accuracy)} m`;
  accEl.className = `dt-stat-value ${accuracy < 20 ? "good" : accuracy < 60 ? "warn" : "bad"}`;
  speedEl.textContent = speed != null ? `${(speed * 3.6).toFixed(1)} km/h` : "—";

  _updateMiniMap(latitude, longitude);
  _sendLocation();
}

function _onPositionError(err) {
  const coordsEl = document.getElementById("dt-coords");
  if (coordsEl) { coordsEl.textContent = `GPS error: ${err.message}`; coordsEl.className = "dt-stat-value bad"; }
}

async function _sendLocation() {
  if (!_lastPosition || !_vehicleId || !_token) return;
  const { latitude, longitude, speed, heading } = _lastPosition.coords;
  try {
    await apiRequest(`/tracking/${_vehicleId}`, {
      method: "POST",
      headers: authHeaders(_token),
      body: JSON.stringify({
        latitude,
        longitude,
        speed_kmh: speed != null ? speed * 3.6 : null,
        heading: heading ?? null,
      }),
    });
    const el = document.getElementById("dt-last-sent");
    if (el) { el.textContent = new Date().toLocaleTimeString(); el.className = "dt-stat-value good"; }
  } catch {
    const el = document.getElementById("dt-last-sent");
    if (el) { el.textContent = "Send failed"; el.className = "dt-stat-value bad"; }
  }
}

// ── Mini map ──────────────────────────────────────────────────────────────────

function _initMiniMap() {
  if (typeof L === "undefined") return;
  setTimeout(() => {
    const container = document.getElementById("dt-mini-map");
    if (!container) return;
    _map = L.map("dt-mini-map", { zoomControl: false, attributionControl: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(_map);
    _map.setView([20, 0], 3);
    setTimeout(() => _map?.invalidateSize(), 200);
  }, 60);
}

function _updateMiniMap(lat, lng) {
  if (!_map) return;
  if (_marker) {
    _marker.setLatLng([lat, lng]);
  } else {
    const icon = L.divIcon({
      className: "",
      html: `<div class="dt-map-pin"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
    _marker = L.marker([lat, lng], { icon }).addTo(_map);
  }
  _map.setView([lat, lng], 15);
}
