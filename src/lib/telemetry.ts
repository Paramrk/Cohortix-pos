const TELEMETRY_STORAGE_KEY = 'pos_runtime_metrics_v1';
const FAILURE_ALERT_THRESHOLD = 3;
const FAILURE_ALERT_WINDOW_MS = 5 * 60 * 1000;
const MAX_LATENCY_SAMPLES = 200;

export interface RuntimeTelemetrySnapshot {
  orderCreateSuccess: number;
  orderCreateFailure: number;
  orderCreateLatencyMs: number[];
  realtimeDisconnects: number;
  recentOrderFailureTimestamps: number[];
  lastAlertAt?: number;
}

type TelemetryApp = 'pos' | 'customer';

function readSnapshot(): RuntimeTelemetrySnapshot {
  try {
    const raw = localStorage.getItem(TELEMETRY_STORAGE_KEY);
    if (!raw) {
      return {
        orderCreateSuccess: 0,
        orderCreateFailure: 0,
        orderCreateLatencyMs: [],
        realtimeDisconnects: 0,
        recentOrderFailureTimestamps: [],
      };
    }
    const parsed = JSON.parse(raw) as Partial<RuntimeTelemetrySnapshot>;
    return {
      orderCreateSuccess: Number(parsed.orderCreateSuccess ?? 0),
      orderCreateFailure: Number(parsed.orderCreateFailure ?? 0),
      orderCreateLatencyMs: Array.isArray(parsed.orderCreateLatencyMs)
        ? parsed.orderCreateLatencyMs.filter((value) => Number.isFinite(value)).map((value) => Number(value))
        : [],
      realtimeDisconnects: Number(parsed.realtimeDisconnects ?? 0),
      recentOrderFailureTimestamps: Array.isArray(parsed.recentOrderFailureTimestamps)
        ? parsed.recentOrderFailureTimestamps
            .filter((value) => Number.isFinite(value))
            .map((value) => Number(value))
        : [],
      lastAlertAt: Number.isFinite(parsed.lastAlertAt) ? Number(parsed.lastAlertAt) : undefined,
    };
  } catch {
    return {
      orderCreateSuccess: 0,
      orderCreateFailure: 0,
      orderCreateLatencyMs: [],
      realtimeDisconnects: 0,
      recentOrderFailureTimestamps: [],
    };
  }
}

function saveSnapshot(snapshot: RuntimeTelemetrySnapshot) {
  localStorage.setItem(TELEMETRY_STORAGE_KEY, JSON.stringify(snapshot));
}

function emitEvent(event: Record<string, unknown>) {
  console.info('[telemetry]', JSON.stringify(event));
}

export function recordOrderCreate(app: TelemetryApp, success: boolean, latencyMs: number, context?: Record<string, unknown>) {
  const snapshot = readSnapshot();
  const safeLatency = Number.isFinite(latencyMs) && latencyMs >= 0 ? Math.round(latencyMs) : 0;

  if (success) {
    snapshot.orderCreateSuccess += 1;
  } else {
    snapshot.orderCreateFailure += 1;
    const now = Date.now();
    const recent = [...snapshot.recentOrderFailureTimestamps, now].filter(
      (timestamp) => now - timestamp <= FAILURE_ALERT_WINDOW_MS,
    );
    snapshot.recentOrderFailureTimestamps = recent;
    if (recent.length >= FAILURE_ALERT_THRESHOLD && (!snapshot.lastAlertAt || now - snapshot.lastAlertAt > FAILURE_ALERT_WINDOW_MS)) {
      snapshot.lastAlertAt = now;
      console.warn('[telemetry][alert] repeated order creation failures detected', {
        app,
        failures: recent.length,
        windowMs: FAILURE_ALERT_WINDOW_MS,
      });
    }
  }

  snapshot.orderCreateLatencyMs = [...snapshot.orderCreateLatencyMs, safeLatency].slice(-MAX_LATENCY_SAMPLES);
  saveSnapshot(snapshot);
  emitEvent({
    type: 'order_create',
    app,
    success,
    latencyMs: safeLatency,
    ...(context ?? {}),
  });
}

export function recordRealtimeDisconnect(app: TelemetryApp, channel: string, reason?: string) {
  const snapshot = readSnapshot();
  snapshot.realtimeDisconnects += 1;
  saveSnapshot(snapshot);
  emitEvent({
    type: 'realtime_disconnect',
    app,
    channel,
    reason: reason ?? 'unknown',
  });
}

function percentile(values: number[], pct: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function getRuntimeTelemetrySummary() {
  const snapshot = readSnapshot();
  return {
    ...snapshot,
    latencyP50: percentile(snapshot.orderCreateLatencyMs, 50),
    latencyP95: percentile(snapshot.orderCreateLatencyMs, 95),
  };
}
