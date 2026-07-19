const JWT_KEY = "et.jwt";

export function checkAuth() {
  return sessionStorage.getItem(JWT_KEY);
}

export async function login(password) {
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Login failed");
  }
  const { token } = await res.json();
  sessionStorage.setItem(JWT_KEY, token);
}

export function logout() {
  sessionStorage.removeItem(JWT_KEY);
  location.reload();
}

export function showLoginOverlay() {
  document.getElementById("auth-overlay").hidden = false;
  document.getElementById("auth-error").textContent = "";
  document.getElementById("auth-password").value = "";
}

export function hideLoginOverlay() {
  document.getElementById("auth-overlay").hidden = true;
}
