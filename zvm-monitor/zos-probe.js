// zos-probe.js
export async function probeZos(endpoint, timeoutMs = 2000) {
  const start = Date.now()
  try {
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(timeoutMs) })
    return {
      ok: res.ok,
      latency_ms: Date.now() - start,
      timeout: false,
    }
  } catch {
    return {
      ok: false,
      latency_ms: timeoutMs,
      timeout: true,
    }
  }
}
