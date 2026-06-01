import { apiRequest } from "./api.js";
import { renderEntityTable, renderFilters, renderInlineError, renderManagementPage, showConfirm, showToast, showLoader, hideLoader, openSidePanel, closeSidePanel } from "./components.js";
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
      <button class="ghost-btn" id="route-search-btn" type="button">Search</button>
      <button class="primary-btn" id="create-route-btn" type="button">+ New Route</button>
    `),
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
          <td><div class="table-actions">
            <button class="table-btn" data-route-edit="${route.id}">Edit</button>
            <button class="table-btn danger-btn" data-route-delete="${route.id}" data-route-code="${route.route_code}">Delete</button>
          </div></td>
        </tr>
      `),
      emptyMessage: "No routes yet. Click + New Route to create one.",
    }),
  });

  bindActions();
}

function buildFormHTML(route = null) {
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
      <div class="field">
        <label>Start Point</label>
        <input name="start_point" value="${v("start_point")}" placeholder="e.g. Central Bus Terminal" required>
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

  document.getElementById("route-panel-submit").addEventListener("click", submitRouteForm);
  document.getElementById("route-panel-cancel").addEventListener("click", closeSidePanel);
}

function bindActions() {
  document.getElementById("logout-btn").addEventListener("click", () => logout(_token));
  document.getElementById("create-route-btn").addEventListener("click", () => openRoutePanel());
  document.getElementById("route-search-btn").addEventListener("click", applyRouteSearch);

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
    openRoutePanel(route);
  } catch {
    showToast("Could not load route data.", "error");
  } finally {
    hideLoader();
  }
}

async function submitRouteForm() {
  const errorNode = document.getElementById("route-form-error");
  errorNode.textContent = "";
  const form = document.getElementById("route-form");
  if (!form.checkValidity()) { form.reportValidity(); return; }

  const formData = new FormData(form);
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
    closeSidePanel();
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
  showLoader("Searching…");
  try {
    const user = await fetchCurrentUser(_token);
    const routes = await apiRequest(search ? `/routes?search=${encodeURIComponent(search)}` : "/routes", { headers: authHeaders(_token) });
    render(user, routes);
  } finally {
    hideLoader();
  }
}
