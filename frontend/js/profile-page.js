import { apiRequest } from "./api.js";
import { renderInlineError, renderShellLayout, showToast, showLoader, hideLoader, openSidePanel, closeSidePanel } from "./components.js";
import { authHeaders, fetchCurrentUser, logout } from "./page-utils.js";


let _container, _token;

export async function mount(container, token) {
  _container = container;
  _token = token;
  await loadPage();
}

async function loadPage() {
  showLoader("Loading Profile…");
  try {
    const user = await fetchCurrentUser(_token);
    render(user);
  } finally {
    hideLoader();
  }
}

const getInitials = (name) => name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");

function render(user) {
  _container.innerHTML = renderShellLayout({
    user,
    activeNav: "profile",
    title: "My Profile",
    subtitle: "View and update your account details.",
    content: `
      <section class="dashboard-grid">
        <div style="max-width:480px">
          <div class="profile-card">
            <div class="profile-avatar-row">
              <div class="profile-avatar">${getInitials(user.full_name)}</div>
              <div class="profile-meta">
                <strong>${user.full_name}</strong>
                <span>${user.email}</span><br>
                <span class="badge ${user.role}" style="margin-top:6px">${user.role}</span>
              </div>
            </div>
            <button class="primary-btn" id="edit-profile-btn" type="button" style="width:100%;margin-top:16px">Edit Profile</button>
          </div>
        </div>
      </section>
    `,
  });

  document.getElementById("logout-btn").addEventListener("click", () => logout(_token));
  document.getElementById("edit-profile-btn").addEventListener("click", () => openProfilePanel(user));
}

function openProfilePanel(user) {
  openSidePanel({
    title: "Edit Profile",
    subtitle: "Update your display name or password.",
    body: `
      <form id="profile-form" class="form-grid">
        <div class="field">
          <label>Full Name</label>
          <input name="full_name" value="${user.full_name}" minlength="2" maxlength="100" required>
        </div>
        <div class="field">
          <label>New Password</label>
          <input name="password" type="password" minlength="8" maxlength="128" placeholder="Leave blank to keep current">
        </div>
        ${renderInlineError("profile-form-error")}
      </form>
    `,
    footer: `
      <button class="primary-btn" id="profile-panel-submit" type="button">Save Changes</button>
      <button class="ghost-btn" type="button" id="profile-panel-cancel">Cancel</button>
    `,
  });
  document.getElementById("profile-panel-submit").addEventListener("click", submitProfileForm);
  document.getElementById("profile-panel-cancel").addEventListener("click", closeSidePanel);
}

async function submitProfileForm() {
  const errorNode = document.getElementById("profile-form-error");
  errorNode.textContent = "";
  const fd = new FormData(document.getElementById("profile-form"));
  const payload = {};
  const name = fd.get("full_name").trim();
  const password = fd.get("password").trim();
  if (name) payload.full_name = name;
  if (password) payload.password = password;

  if (!Object.keys(payload).length) {
    errorNode.textContent = "No changes to save.";
    return;
  }

  showLoader("Saving Profile…");
  try {
    await apiRequest("/auth/me", { method: "PATCH", headers: authHeaders(_token), body: JSON.stringify(payload) });
    showToast("Profile updated.");
    closeSidePanel();
    await loadPage();
  } catch (e) {
    hideLoader();
    errorNode.textContent = e.message;
  }
}

