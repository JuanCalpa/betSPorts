const API_BASE = "/api";

async function request(path, options = {}) {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  const response = await fetch(`${API_BASE}${path}`, {
    headers,
    ...options,
  });

  const text = await response.text();
  const payload = text.length > 0 ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = payload?.error || payload?.message || "No se pudo completar la solicitud.";
    throw new Error(message);
  }

  return payload;
}

export function loadDashboard(date) {
  return request(`/dashboard?date=${date}`);
}

export function loadHistory() {
  return request("/history");
}

export function loadCountries() {
  return request(`/countries`);
}

export function createUser(name) {
  return request(`/users`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function createDay(payload) {
  return request(`/days`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createBet(payload) {
  return request(`/bets`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateMatchResult(matchId, payload) {
  return request(`/matches/${matchId}/result`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function finalizeDay(dayId) {
  return request(`/days/${dayId}/finalize`, {
    method: "POST",
  });
}
