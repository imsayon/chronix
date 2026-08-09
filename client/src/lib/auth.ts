/**
 * Module-level session store.
 *
 * Stores the access token in memory only — never localStorage or sessionStorage.
 * Refresh tokens live in an httpOnly cookie managed by the server.
 *
 * Usage:
 *   setSession(accessToken)  — called after login/register/refresh
 *   clearSession()           — called on logout
 *   getAccessToken()         — called by apiFetch to inject Authorization header
 */

let _accessToken: string | null = null;

export function setSession(token: string): void {
  _accessToken = token;
}

export function clearSession(): void {
  _accessToken = null;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

export function isAuthenticated(): boolean {
  return _accessToken !== null;
}
