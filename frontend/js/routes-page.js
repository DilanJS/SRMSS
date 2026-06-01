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
  showLoader("Loading Routes…");
  try {
    const user = await fetchCurrentUser(_token);
    const routes = await apiRequest("/routes", { headers: authHeaders(_token) });
    render(user, routes);
  } finally {
    hideLoader();
  }
}

function render(user, routes) {
  const activeRoutes = routes.filter((r) => r.active).length;
  _container.innerHTML = renderManagementPage({
    user,
    activeNav: "routes",
    title: "Route Management",
    subtitle: "Define, review, and refine route coverage for depot operations.",
    statsCards: [
      { label: "Total Routes", value: routes.length },
      { label: "Active Routes", value: activeRoutes },
      { label: "Inactive Routes", value: routes.length - activeRoutes },
      { label: "Express Routes", value: routes.filter((r) => r.service_type === "express").length },
      { label: "City Routes", value: routes.filter((r) => r.service_type === "city").length },
    ],
    filterMarkup: renderFilters(`
      <input class="filter-input" id="route-search" placeholder="Search route code or name">
      <button class="ghost-btn" id="route-search-btn" type="button">Filter</button>
    `),
    formTitle: "Route",
    formMarkup: `
      <div class="form-mode-label">
        <span id="form-mode-text">Create Route</span>
        <span class="edit-badge" id="edit-badge" style="display:none">Editing</span>
      </div>
      <form id="route-form" class="form-grid compact-form">
        <div class="field"><label>Route Code</label><input name="route_code" required></div>
        <div class="field"><label>Route Name</label><input name="route_name" required></div>
        <div class="field"><label>Start Point</label><input name="start_point" required></div>
        <div class="field"><label>End Point</label><input name="end_point" required></div>
        <div class="split-grid">
          <div class="field"><label>Distance KM</label><input name="distance_km" type="number" step="0.1" required></div>
          <div class="field"><label>Duration Min</label><input name="estimated_duration_minutes" type="number" required></div>
        </div>
        <div class="field">
          <label>Service Type</label>
          <select name="service_type">
            <option value="city">City</option>
            <option value="suburban">Suburban</option>
            <option value="express">Express</option>
            <option value="intercity">Intercity</option>
            <option value="school">School</option>
            <option value="special">Special</option>
          </select>
        </div>
        <div class="field" id="active-field" style="display:none">
          <label>Status</label>
          <select name="active">
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
        ${renderInlineError("route-form-error")}
        <div class="form-actions">
          <button class="primary-btn" type="submit" id="route-submit-btn">Create Route</button>
          <button class="ghost-btn" type="button" id="route-cancel-btn" style="display:none">Cancel</button>
        </div>
      </form>
    `,
    tableTitle: "Routes",
    tableMarkup: renderEntityTable({
      columns: ["Code", "Name", "Service", "Distance", "Status", "Actions"],
      rows: routes.map((route) => `
        <tr>
          <td>${route.route_code}</td>
          <td>${route.route_name}</td>
          <td>${route.service_type}</td>
          <td>${route.distance_km} km</td>
          <td><span class="badge ${route.active ? "active" : "inactive"}">${route.active ? "active" : "inactive"}</span></td>
          <td style="display:flex;gap:6px">
            <button class="table-btn" data-route-edit="${route.id}">Edit</button>
            <button class="table-btn danger-btn" data-route-delete="${route.id}" data-route-code="${route.route_code}">Delete</button>
          </td>
        </tr>
      `),
      emptyMessage: "No routes available yet.",
    }),
  });

  document.getElementById("logout-btn").addEventListener("click", () => logout(_token));
  document.getElementById("route-form").addEventListener("submit", submitRouteForm);
  document.getElementById("route-search-btn").addEventListener("click", applyRouteSearch);
  document.getElementById("route-cancel-btn").addEventListener("click", resetForm);

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
}

async function startEdit(id) {
  showLoader("Loading Route…");
  try {
    const route = await apiRequest(`/routes/${id}`, { headers: authHeaders(_token) });
    editingId = id;
    const form = document.getElementById("route-form");
    form.route_code.value = route.route_code;
    form.route_name.value = route.route_name;
    form.start_point.value = route.start_point;
    form.end_point.value = route.end_point;
    form.distance_km.value = route.distance_km;
    form.estimated_duration_minutes.value = route.estimated_duration_minutes;
    form.service_type.value = route.service_type;
    form.active.value = String(route.active);
    document.getElementById("form-mode-text").textContent = "Edit Route";
    document.getElementById("edit-badge").style.display = "";
    document.getElementById("route-submit-btn").textContent = "Save Changes";
    document.getElementById("route-cancel-btn").style.display = "";
    document.getElementById("active-field").style.display = "";
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch {
    showToast("Could not load route data.", "error");
  } finally {
    hideLoader();
  }
}

function resetForm() {
  editingId = null;
  document.getElementById("route-form").reset();
  document.getElementById("form-mode-text").textContent = "Create Route";
  document.getElementById("edit-badge").style.display = "none";
  document.getElementById("route-submit-btn").textContent = "Create Route";
  document.getElementById("route-cancel-btn").style.display = "none";
  document.getElementById("active-field").style.display = "none";
  document.getElementById("route-form-error").textContent = "";
}

async function submitRouteForm(event) {
  event.preventDefault();
  const errorNode = document.getElementById("route-form-error");
  errorNode.textContent = "";
  const formData = new FormData(event.currentTarget);
  const payload = {
    route_code: formData.get("route_code"),
    route_name: formData.get("route_name"),
    start_point: formData.get("start_point"),
    end_point: formData.get("end_point"),
    distance_km: Number(formData.get("distance_km")),
    estimated_duration_minutes: Number(formData.get("estimated_duration_minutes")),
    service_type: formData.get("service_type"),
  };

  showLoader(editingId ? "Updating Route…" : "Creating Route…");
  try {
    if (editingId) {
      payload.active = formData.get("active") === "true";
      await apiRequest(`/routes/${editingId}`, { method: "PUT", headers: authHeaders(_token), body: JSON.stringify(payload) });
      showToast("Route updated successfully.");
    } else {
      payload.active = true;
      payload.stops = [];
      payload.path_points = [];
      await apiRequest("/routes", { method: "POST", headers: authHeaders(_token), body: JSON.stringify(payload) });
      showToast("Route created successfully.");
    }
    await loadPage();
  } catch (error) {
    hideLoader();
    errorNode.textContent = error.message;
  }
}

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
  const search = document.getElementById("route-search").value.trim();
  showLoader("Filtering Routes…");
  try {
    const user = await fetchCurrentUser(_token);
    const routes = await apiRequest(search ? `/routes?search=${encodeURIComponent(search)}` : "/routes", { headers: authHeaders(_token) });
    render(user, routes);
  } finally {
    hideLoader();
  }
}
