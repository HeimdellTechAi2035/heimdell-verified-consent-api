export function isDashboardPerfDebugEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.DEBUG_DASHBOARD_PERF === "1" || env.NODE_ENV === "development";
}

export function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function logDashboardTiming(
  label: string,
  startedAt: number,
  metadata: Record<string, string | number | boolean | null> = {}
): void {
  if (!isDashboardPerfDebugEnabled()) {
    return;
  }

  console.info("[dashboard-perf]", {
    label,
    durationMs: Math.round(nowMs() - startedAt),
    ...metadata,
  });
}
