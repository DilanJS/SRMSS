const TOKEN_KEY = "srmss_access_token";
const USER_KEY = "srmss_user";

export function saveSession(session) {
  localStorage.setItem(TOKEN_KEY, session.access_token);
  localStorage.setItem(USER_KEY, JSON.stringify(session.user));
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser() {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function requireAuth() {
  if (!getToken()) {
    window.location.href = "/frontend/index.html";
    return false;
  }
  return true;
}
