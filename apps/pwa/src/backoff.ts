const BASE_MS = 1000;
const MAX_MS = 30_000;

export function reconnectDelayMs(attempt: number): number {
  return Math.min(BASE_MS * 2 ** Math.max(attempt, 0), MAX_MS);
}
