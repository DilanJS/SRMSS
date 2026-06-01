import { apiRequest } from "./api.js";
import { renderEntityTable, renderFilters, renderInlineError, renderManagementPage, showConfirm, showToast, showLoader, hideLoader, openSidePanel, closeSidePanel } from "./components.js";
import { authHeaders, fetchCurrentUser, logout } from "./page-utils.js";

// Roles defined by the system plan
const ROLES = [
  { value: "admin",   label: "Admin",   desc: "Full system access — manage users, routes, vehicles, drivers." },
  { value: "manager", label: "Manager", desc: "Manage schedules, generate reports, monitor dashboard." },
  { value: "driver",  label: "Driver",  desc: "View assigned routes and schedules." },
  { value: "user",    label: "User",    desc: "View routes and track buses." },
];

let _container, _token, _currentUserId;
let editingId = null;

export async function mount(container, token) {
  _container = container;
  _token = token;
  editingId = null;
  await loadPage();
}

async function loadPage() {
  showLoader("Loading Users…");
  try {
    const [me, users] = await Promise.all([
      fetchCurrentUser(_token),
      apiRequest("/auth/users", { headers: authHeaders(_token) }),
    ]);
    _currentUserId = me.id;
    render(me, users);
  } catch (e) {
    hideLoader();
    showToast(e.message || "Failed to load users. Admin access required.", "error");
  } finally {
    hideLoader();
  }
}

function roleCount(users, role) {
  return users.filter((u) => u.role === role).length;
}

function render(me, users) {
  _container.innerHTML = renderManagementPage({
    user: me,
    activeNav: "users",
    title: "User Management",
    subtitle: "Create and manage system user accounts with predefined role-based access.",
    statsCards: [
      { label: "Total Users", value: users.length },
      { label: "Admins", value: roleCount(users, "admin") },
      { label: "Managers", value: roleCount(users, "manager") },
      { label: "Drivers", value: roleCount(users, "driver") },
      { label: "Users", value: roleCount(users, "user") },
    ],
    filterMarkup: renderFilters(`
      <input class="filter-input" id="user-search" placeholder="Search name or email">
      <select class="filter-input" id="role-filter" style="max-width:160px">
        <option value="">All Roles</option>
        ${ROLES.map((r) => `<option value="${r.value}">${r.label}</option>`).join("")}
      </select>
      <button class="ghost-btn" id="user-filter-btn" type="button">Filter</button>
      <button class="primary-btn" id="create-user-btn" type="button">+ New User</button>
    `),
    tableTitle: "System Users",
    tableMarkup: renderEntityTable({
      columns: ["Name", "Email", "Role", "Created", "Actions"],
      rows: users.map((u) => `
        <tr>
          <td>
            <div style="display:flex;align-items:center;gap:10px">
              <div class="user-avatar" style="width:32px;height:32px;font-size:13px;flex-shrink:0">${initials(u.full_name)}</div>
              <strong>${u.full_name}</strong>
            </div>
          </td>
          <td style="color:var(--text-soft)">${u.email}</td>
          <td><span class="badge ${u.role}">${u.role}</span></td>
          <td style="color:var(--text-soft)">${fmtDate(u.created_at)}</td>
          <td><div class="table-actions">
            <button class="table-btn" data-user-edit="${u.id}">Edit</button>
            ${u.id !== _currentUserId
              ? `<button class="table-btn danger-btn" data-user-delete="${u.id}" data-user-name="${u.full_name}">Delete</button>`
              : `<span style="font-size:12px;color:var(--text-soft);padding:0 4px">You</span>`
            }
          </div></td>
        </tr>
      `),
      emptyMessage: "No users found.",
    }),
  });

  bindActions();
}

// ── Form ──────────────────────────────────────────────────────────────────────

function buildFormHTML(user = null) {
  const v = (f) => user ? (user[f] ?? "") : "";
  return `
    <form id="user-form" class="form-grid">

      <div class="field">
        <label>Full Name</label>
        <input name="full_name" value="${v("full_name")}" placeholder="e.g. John Silva" minlength="2" maxlength="100" required>
      </div>

      <div class="field">
        <label>Email Address</label>
        <input name="email" type="email" value="${v("email")}" placeholder="e.g. john@srmss.local"
          ${user ? "readonly style=\"opacity:0.6;cursor:not-allowed\"" : "required"}>
        ${user ? `<p style="font-size:12px;color:var(--text-soft);margin:6px 0 0">Email cannot be changed after account creation.</p>` : ""}
      </div>

      <div class="field">
        <label>${user ? "New Password" : "Password"}</label>
        <input name="password" type="password" minlength="8" maxlength="128"
          placeholder="${user ? "Leave blank to keep current password" : "Min. 8 characters"}"
          ${user ? "" : "required"}>
      </div>

      <div class="field">
        <label>Role</label>
        <div class="role-picker" id="role-picker">
          ${ROLES.map((r) => `
            <label class="role-option ${v("role") === r.value || (!user && r.value === "user") ? "selected" : ""}">
              <input type="radio" name="role" value="${r.value}"
                ${v("role") === r.value || (!user && r.value === "user") ? "checked" : ""}>
              <div class="role-option-content">
                <span class="role-option-label">${r.label}</span>
                <span class="role-option-desc">${r.desc}</span>
              </div>
            </label>
          `).join("")}
        </div>
      </div>

      ${renderInlineError("user-form-error")}
    </form>
  `;
}

function openUserPanel(user = null) {
  editingId = user?.id || null;
  openSidePanel({
    title: user ? "Edit User" : "New User",
    subtitle: user ? `Editing ${user.full_name}` : "Create a new system account with a predefined role.",
    body: buildFormHTML(user),
    footer: `
      <button class="primary-btn" id="user-panel-submit" type="button">${user ? "Save Changes" : "Create User"}</button>
      <button class="ghost-btn" type="button" id="user-panel-cancel">Cancel</button>
    `,
  });

  // Highlight selected role card on change
  document.querySelectorAll(".role-option input").forEach((radio) => {
    radio.addEventListener("change", () => {
      document.querySelectorAll(".role-option").forEach((el) => el.classList.remove("selected"));
      radio.closest(".role-option").classList.add("selected");
    });
  });

  document.getElementById("user-panel-submit").addEventListener("click", submitUserForm);
  document.getElementById("user-panel-cancel").addEventListener("click", closeSidePanel);
}

// ── Actions ───────────────────────────────────────────────────────────────────

function bindActions() {
  document.getElementById("logout-btn").addEventListener("click", () => logout(_token));
  document.getElementById("create-user-btn").addEventListener("click", () => openUserPanel());
  document.getElementById("user-filter-btn").addEventListener("click", applyFilter);

  document.querySelectorAll("[data-user-edit]").forEach((btn) => {
    btn.addEventListener("click", () => startEdit(btn.dataset.userEdit));
  });

  document.querySelectorAll("[data-user-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      showConfirm({
        title: "Delete User",
        message: `Delete account for <strong>${btn.dataset.userName}</strong>? They will lose all access immediately.`,
        onConfirm: () => deleteUser(btn.dataset.userDelete),
      });
    });
  });
}

async function startEdit(id) {
  showLoader("Loading User…");
  try {
    const user = await apiRequest(`/auth/users/${id}`, { headers: authHeaders(_token) });
    openUserPanel(user);
  } catch {
    showToast("Could not load user data.", "error");
  } finally {
    hideLoader();
  }
}

async function submitUserForm() {
  const errorNode = document.getElementById("user-form-error");
  errorNode.textContent = "";
  const form = document.getElementById("user-form");
  if (!form.checkValidity()) { form.reportValidity(); return; }

  const fd = new FormData(form);
  const password = fd.get("password").trim();

  showLoader(editingId ? "Updating User…" : "Creating User…");
  try {
    if (editingId) {
      const payload = { full_name: fd.get("full_name"), role: fd.get("role") };
      if (password) payload.password = password;
      await apiRequest(`/auth/users/${editingId}`, { method: "PATCH", headers: authHeaders(_token), body: JSON.stringify(payload) });
      showToast("User updated successfully.");
    } else {
      await apiRequest("/auth/users", {
        method: "POST",
        headers: authHeaders(_token),
        body: JSON.stringify({
          full_name: fd.get("full_name"),
          email: fd.get("email"),
          password: fd.get("password"),
          role: fd.get("role"),
        }),
      });
      showToast("User created successfully.");
    }
    closeSidePanel();
    await loadPage();
  } catch (error) {
    hideLoader();
    errorNode.textContent = error.message;
  }
}

async function deleteUser(id) {
  showLoader("Deleting User…");
  try {
    await apiRequest(`/auth/users/${id}`, { method: "DELETE", headers: authHeaders(_token) });
    showToast("User deleted.", "info");
    await loadPage();
  } catch (e) {
    hideLoader();
    showToast(e.message, "error");
  }
}

async function applyFilter() {
  const search = document.getElementById("user-search").value.trim().toLowerCase();
  const role = document.getElementById("role-filter").value;
  showLoader("Filtering…");
  try {
    const [me, users] = await Promise.all([
      fetchCurrentUser(_token),
      apiRequest("/auth/users", { headers: authHeaders(_token) }),
    ]);
    const filtered = users.filter((u) => {
      const matchesSearch = !search || u.full_name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search);
      const matchesRole = !role || u.role === role;
      return matchesSearch && matchesRole;
    });
    render(me, filtered);
  } finally {
    hideLoader();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const initials = (name) => name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");
const fmtDate = (value) => new Date(value).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
