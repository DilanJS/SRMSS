const API_BASE = "";

export async function apiRequest(path, options = {}) {
  const { headers: optHeaders, ...restOptions } = options;
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(optHeaders || {}),
    },
    ...restOptions,
  });

  if (!response.ok) {
    let detail = "Request failed.";
    try {
      const body = await response.json();
      if (typeof body.detail === "string") {
        detail = body.detail;
      } else if (Array.isArray(body.detail)) {
        detail = body.detail.map((e) => e.msg || String(e)).join("; ");
      } else if (body.detail) {
        detail = body.detail.message || JSON.stringify(body.detail);
      }
    } catch {
      detail = response.statusText || detail;
    }
    throw new Error(detail);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}
