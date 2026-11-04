export type AuthStatus = "ok" | "unauthorized" | "unknown";

export function classifyAuthStatus(status: number): AuthStatus {
  if (status >= 200 && status < 300) return "ok";
  if (status === 401 || status === 403) return "unauthorized";
  return "unknown";
}
