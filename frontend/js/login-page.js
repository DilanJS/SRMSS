import { apiRequest } from "./api.js";
import { renderLoginForm } from "./components.js";
import { getToken, getUser, saveSession } from "./auth.js";

if (getToken()) {
  const role = getUser()?.role;
  if (role === "driver") {
    window.location.href = "/frontend/app.html#/schedules";
  } else if (role === "user") {
    window.location.href = "/frontend/app.html#/routes";
  } else {
    window.location.href = "/frontend/app.html#/dashboard";
  }
}

const app = document.getElementById("app");
app.innerHTML = renderLoginForm();

const form = document.getElementById("login-form");
const errorNode = document.getElementById("login-error");
const submitButton = document.getElementById("login-submit");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorNode.textContent = "";
  submitButton.disabled = true;
  submitButton.textContent = "Signing In...";

  const formData = new FormData(form);
  const payload = {
    email: String(formData.get("email") || ""),
    password: String(formData.get("password") || ""),
  };

  try {
    const session = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    saveSession(session);
    const role = session.user.role;
    if (role === "admin" || role === "manager") {
      window.location.href = "/frontend/app.html#/dashboard";
    } else if (role === "driver") {
      window.location.href = "/frontend/app.html#/schedules";
    } else {
      window.location.href = "/frontend/app.html#/routes";
    }
  } catch (error) {
    errorNode.textContent = error.message;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Sign In";
  }
});
