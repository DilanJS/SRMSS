// Driver GPS tracker — standalone page (no ES module imports)
const API_BASE = "";
const REPORT_INTERVAL_MS = 8000;

let _token = null;
let _vehicleId = null;
let _watchId = null;
let _reportTimer = null;
let _lastPosition = null;
let _miniMap = null;
let _miniMarker = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

function el(id) { return document.getElementById(id); }

function showSection(section) {
  ["login-section", "tracker-section"].forEach(id => el(id).classList.remove("active"));
  el(section).classList.add("active");
}

async function apiFetch(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    let msg = "Request failed.";
    try { const b = await res.json(); msg = b.detail || msg; } catch {}
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return res.status === 204 ? null : res.json();
}

// ── Auth ─────────────────────────────────────────────────────────────────────

function loadStoredToken() {
  _token = localStorage.getItem("srmss_token");
  return !!_token;
}

function storeToken(token) {
  _token = token;
  localStorage.setItem("srmss_token", token);
}

function clearToken() {
  _token = null;
  localStorage.removeItem("srmss_token");
}

// ── Login ────────────────────────────────────────────────────────────────────

async function handleLogin() {
  const email = el("login-email").value.trim();
  const password = el("login-password").value;
  const errEl = el("login-error");
  errEl.style.display = "none";

  if (!email || !password) { errEl.textContent = "Email and password required."; errEl.style.display = "block"; return; }

  el("login-btn").disabled = true;
  try {
    const data = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    storeToken(data.access_token);
    await enterTracker();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = "block";
  } finally {
    el("login-btn").disabled = false;
  }
}

// ── Tracker setup ─────────────────────────────────────────────────────────────

async function enterTracker() {
  showSection("tracker-section");
  await loadVehicles();
}

async function loadVehicles() {
  try {
    const vehicles = await apiFetch("/vehicles", {
      headers: { Authorization: `Bearer ${_token}` },
    });
    const sel = el("vehicle-select");
    sel.innerHTML = `<option value="">— Select vehicle —</option>` +
      vehicles
        .filter(v => v.active)
        .map(v => `<option value="${v.id}">${v.fleet_number} — ${v.registration_no}</option>`)
        .join("");
    el("start-btn").disabled = false;
  } catch (e) {
    el("vehicle-select").innerHTML = `<option value="">Failed to load vehicles</option>`;
  }
}

// ── GPS tracking ──────────────────────────────────────────────────────────────

function startTracking() {
  _vehicleId = el("vehicle-select").value;
  if (!_vehicleId) { alert("Please select a vehicle."); return; }

  const vehicleText = el("vehicle-select").selectedOptions[0]?.text ?? _vehicleId;

  if (!navigator.geolocation) {
    alert("GPS is not available on this device.");
    return;
  }

  el("vehicle-select-card").style.display = "none";
  el("status-card").style.display = "block";
  el("stop-btn").style.display = "block";
  el("start-btn").style.display = "none";
  el("status-vehicle").textContent = vehicleText;

  initMiniMap();

  _watchId = navigator.geolocation.watchPosition(
    onPositionUpdate,
    onPositionError,
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );

  // Send immediately on first fix, then every REPORT_INTERVAL_MS
  _reportTimer = setInterval(sendLocation, REPORT_INTERVAL_MS);
}

function stopTracking() {
  if (_watchId != null) { navigator.geolocation.clearWatch(_watchId); _watchId = null; }
  if (_reportTimer) { clearInterval(_reportTimer); _reportTimer = null; }
  _lastPosition = null;

  el("vehicle-select-card").style.display = "block";
  el("status-card").style.display = "none";
  el("stop-btn").style.display = "none";
  el("tracker-mini-map").style.display = "none";
  el("start-btn").style.display = "block";
}

function onPositionUpdate(pos) {
  _lastPosition = pos;

  const { latitude, longitude, accuracy, speed } = pos.coords;
  el("status-coords").textContent = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  el("status-accuracy").textContent = `${Math.round(accuracy)} m`;
  el("status-accuracy").className = `value ${accuracy < 20 ? "good" : accuracy < 60 ? "warn" : "bad"}`;

  if (speed != null) {
    el("status-speed").textContent = `${(speed * 3.6).toFixed(1)} km/h`;
  }

  updateMiniMap(latitude, longitude);
  sendLocation(); // send immediately on new fix
}

function onPositionError(err) {
  el("status-coords").textContent = `GPS error: ${err.message}`;
  el("status-coords").className = "value bad";
}

async function sendLocation() {
  if (!_lastPosition || !_vehicleId || !_token) return;
  const { latitude, longitude, speed, heading } = _lastPosition.coords;
  try {
    await apiFetch(`/tracking/${_vehicleId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${_token}` },
      body: JSON.stringify({
        latitude,
        longitude,
        speed_kmh: speed != null ? speed * 3.6 : null,
        heading: heading ?? null,
      }),
    });
    el("status-last-sent").textContent = new Date().toLocaleTimeString();
    el("status-last-sent").className = "value good";
  } catch {
    el("status-last-sent").textContent = "Failed to send";
    el("status-last-sent").className = "value bad";
  }
}

// ── Mini map ──────────────────────────────────────────────────────────────────

function initMiniMap() {
  el("tracker-mini-map").style.display = "block";
  if (_miniMap) { _miniMap.remove(); _miniMap = null; _miniMarker = null; }

  _miniMap = L.map("tracker-mini-map", { zoomControl: false, attributionControl: false });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(_miniMap);
  _miniMap.setView([20, 0], 3);
}

function updateMiniMap(lat, lng) {
  if (!_miniMap) return;
  if (_miniMarker) {
    _miniMarker.setLatLng([lat, lng]);
  } else {
    const icon = L.divIcon({
      className: "",
      html: `<div style="width:14px;height:14px;border-radius:50%;background:#6366f1;border:2px solid #fff;box-shadow:0 0 6px rgba(99,102,241,0.8)"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
    _miniMarker = L.marker([lat, lng], { icon }).addTo(_miniMap);
  }
  _miniMap.setView([lat, lng], 15);
}

// ── Sign out ──────────────────────────────────────────────────────────────────

function handleLogout() {
  stopTracking();
  clearToken();
  showSection("login-section");
}

// ── Init ─────────────────────────────────────────────────────────────────────

el("login-btn").addEventListener("click", handleLogin);
el("login-password").addEventListener("keydown", e => { if (e.key === "Enter") handleLogin(); });
el("start-btn").addEventListener("click", startTracking);
el("stop-btn").addEventListener("click", stopTracking);
el("logout-tracker-btn").addEventListener("click", handleLogout);

if (loadStoredToken()) {
  enterTracker();
} else {
  showSection("login-section");
}
