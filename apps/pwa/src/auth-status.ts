export type AuthStatus = "ok" | "unauthorized" | "retired" | "unknown";

export function classifyAuthStatus(status: number): AuthStatus {
  if (status >= 200 && status < 300) return "ok";
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 410) return "retired";
  return "unknown";
}
