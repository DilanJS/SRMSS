import { getToken, requireAuth } from "./auth.js";
import { initMobileNav } from "./components.js";

const PAGE_MODULES = {
  "/dashboard": () => import("./dashboard-page.js"),
  "/routes": () => import("./routes-page.js"),
  "/vehicles": () => import("./vehicles-page.js"),
  "/drivers": () => import("./drivers-page.js"),
  "/schedules": () => import("./schedules-page.js"),
  "/maintenance": () => import("./maintenance-page.js"),
  "/reports": () => import("./reports-page.js"),
  "/users": () => import("./users-page.js"),
  "/profile": () => import("./profile-page.js"),
};

if (!requireAuth()) {
  throw new Error("Not authenticated.");
}

const app = document.getElementById("app");
const token = getToken();

async function navigate() {
  const hash = window.location.hash.replace(/^#/, "") || "/dashboard";
  const route = PAGE_MODULES[hash] || PAGE_MODULES["/dashboard"];

  try {
    const module = await route();
    await module.mount(app, token);
    initMobileNav();
  } catch (error) {
    app.innerHTML = `<div style="padding:40px;color:#b63d2c">Failed to load page: ${error.message}</div>`;
  }
}

window.addEventListener("hashchange", navigate);
navigate();
