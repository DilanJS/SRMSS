import { apiRequest } from "./api.js";
import { clearSession, getToken, requireAuth } from "./auth.js";

export function ensureProtectedPage() {
  if (!requireAuth()) {
    throw new Error("Authentication required.");
  }
  return getToken();
}

export async function fetchCurrentUser(token) {
  try {
    return await apiRequest("/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    // Only log out on authentication failure (401), not permission errors (403)
    if (!error.status || error.status === 401) {
      clearSession();
      window.location.href = "/frontend/index.html";
    }
    throw error;
  }
}

export async function logout(token) {
  try {
    await apiRequest("/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Ignore logout failures and clear local session anyway.
  } finally {
    clearSession();
    window.location.href = "/frontend/index.html";
  }
}

export function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}
