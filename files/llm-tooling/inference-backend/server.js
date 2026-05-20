// inference-backend/server.js
// Adapter: polls Ollama or vLLM and exposes GET /api/snapshot
// in the shape the advisor-backend expects.
// Port 9000

import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app  = express();
const PORT = process.env.PORT || 9000;

app.use(cors());
app.use(express.json());

// ── Config ────────────────────────────────────────────────────────────────────
// Set BACKEND=ollama or BACKEND=vllm (default: ollama)
// Set BACKEND_URL to point at your running instance
const BACKEND     = (process.env.BACKEND || "ollama").toLowerCase();
const BACKEND_URL = process.env.BACKEND_URL || (
  BACKEND === "vllm" ? "http://localhost:8000" : "http://localhost:11434"
);

console.log(`✓ Inference adapter starting`);
console.log(`  Backend  : ${BACKEND}`);
console.log(`  Target   : ${BACKEND_URL}`);

// ── Shared state ──────────────────────────────────────────────────────────────
let latestSnapshot = null;
let uptimeSec      = 0;
let requestLog     = [];      // rolling window of { ts, latency_ms, error }
const WINDOW_MS    = 60_000;  // 1-minute rolling window for rate calcs

// ── Helpers ───────────────────────────────────────────────────────────────────
function now() { return Date.now(); }

// Prune request log to the rolling window
function pruneLog() {
  const cutoff = now() - WINDOW_MS;
  requestLog = requestLog.filter(r => r.ts >= cutoff);
}

// Derive inference stats from the rolling request log
function deriveInferenceStats() {
  pruneLog();
  if (requestLog.length === 0) {
    return { avg_ms: 0, p95_ms: 0, p99_ms: 0, throughput_rps: 0, errors_perc: 0 };
  }

  const latencies = requestLog.map(r => r.latency_ms).sort((a, b) => a - b);
  const errors    = requestLog.filter(r => r.error).length;
  const avg_ms    = latencies.reduce((s, v) => s + v, 0) / latencies.length;
  const p95_ms    = latencies[Math.floor(latencies.length * 0.95)] ?? latencies.at(-1);
  const p99_ms    = latencies[Math.floor(latencies.length * 0.99)] ?? latencies.at(-1);
  const throughput_rps = requestLog.length / (WINDOW_MS / 1000);
  const errors_perc    = (errors / requestLog.length) * 100;

  return {
    avg_ms:          Math.round(avg_ms),
    p95_ms:          Math.round(p95_ms),
    p99_ms:          Math.round(p99_ms),
    throughput_rps:  Math.round(throughput_rps * 10) / 10,
    errors_perc:     Math.round(errors_perc * 100) / 100,
  };
}

// ── Ollama adapter ────────────────────────────────────────────────────────────
// Ollama native endpoints used:
//   GET  /api/ps          → running models (VRAM, context size)
//   GET  /api/tags        → loaded models list
//   POST /api/generate    → probe latency with a minimal prompt
async function fetchOllama() {
  const t0 = now();
  let probeError = false;
  let probeLatency = 0;
  let model = "unknown";
  let vram_mb = 0;
  let vram_limit_mb = 0;
  let ctx_used = 0;
  let ctx_limit = 0;
  let tokens_per_sec = 0;

  // 1. Running models → VRAM + active model info
  try {
    const psRes  = await fetch(`${BACKEND_URL}/api/ps`, { timeout: 4000 });
    const psData = await psRes.json();
    const running = psData?.models?.[0];
    if (running) {
      model         = running.name ?? "unknown";
      vram_mb       = Math.round((running.size_vram ?? 0) / 1024 / 1024);
      ctx_used      = running.details?.parameter_count ?? 0;
      ctx_limit     = running.model_info?.["llama.context_length"] ?? 4096;
      // Ollama reports size_vram per model; treat total GPU mem as 2× loaded size as a rough cap
      vram_limit_mb = vram_mb > 0 ? vram_mb * 2 : 8192;
    }
  } catch {
    // ps endpoint not critical — continue
  }

  // 2. Probe with a tiny generate call to measure real latency + tok/s
  try {
    const probeStart = now();
    const genRes = await fetch(`${BACKEND_URL}/api/generate`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        model:  model !== "unknown" ? model : "llama3.1:8b",
        prompt: "Hi",
        stream: false,
        options: { num_predict: 1 },   // single token — pure latency probe
      }),
      timeout: 8000,
    });
    probeLatency = now() - probeStart;

    if (!genRes.ok) {
      probeError = true;
    } else {
      const gen = await genRes.json();
      // Ollama returns eval_count (tokens) and eval_duration (ns)
      if (gen.eval_count && gen.eval_duration) {
        tokens_per_sec = Math.round((gen.eval_count / gen.eval_duration) * 1e9);
      }
      if (gen.model) model = gen.model;
    }
  } catch {
    probeError   = true;
    probeLatency = now() - t0;
  }

  // Record probe into rolling log
  requestLog.push({ ts: now(), latency_ms: probeLatency, error: probeError });

  // 3. CPU / memory from /api/ps size field (best-effort)
  let mem_mb       = 0;
  let mem_limit_mb = 8192;
  try {
    const psRes  = await fetch(`${BACKEND_URL}/api/ps`, { timeout: 3000 });
    const psData = await psRes.json();
    const m = psData?.models?.[0];
    if (m) {
      mem_mb = Math.round((m.size ?? 0) / 1024 / 1024);
    }
  } catch { /* ignore */ }

  const inference = deriveInferenceStats();

  return {
    timestamp: now(),
    backend:   "ollama",
    model,
    inference: {
      ...inference,
      tokens_per_sec,
    },
    resources: {
      cpu_percent:  null,          // Ollama doesn't expose CPU %
      gpu_percent:  null,          // not exposed natively
      mem_mb,
      mem_limit_mb,
      vram_mb,
      vram_limit_mb,
    },
    stability: {
      error_rate:   inference.errors_perc,
      timeout_rate: 0,
      uptime_sec:   uptimeSec,
    },
    health: {
      status: probeError ? "degraded" : "healthy",
      checks: {
        inference: !probeError,
        memory:    mem_mb < mem_limit_mb * 0.95,
      },
    },
    operability: {
      ctx_used,
      ctx_limit,
      last_model: model,
    },
  };
}

// ── vLLM adapter ──────────────────────────────────────────────────────────────
// vLLM native endpoints used:
//   GET  /metrics           → Prometheus text format — rich stats
//   GET  /v1/models         → loaded model name
//   POST /v1/completions    → latency probe
async function fetchVLLM() {
  const t0 = now();
  let model       = "unknown";
  let probeError  = false;
  let probeLatency = 0;

  // 1. Model name
  try {
    const modRes  = await fetch(`${BACKEND_URL}/v1/models`, { timeout: 4000 });
    const modData = await modRes.json();
    model = modData?.data?.[0]?.id ?? "unknown";
  } catch { /* continue */ }

  // 2. Prometheus metrics — parse what we need
  let gpu_cache_usage   = 0;
  let num_requests_running = 0;
  let num_requests_waiting = 0;
  let tokens_per_sec    = 0;
  let gpu_percent       = null;
  let vram_mb           = 0;
  let vram_limit_mb     = 0;

  try {
    const metRes  = await fetch(`${BACKEND_URL}/metrics`, { timeout: 4000 });
    const metText = await metRes.text();

    // Helper: extract numeric value from Prometheus line
    const grab = (key) => {
      const re = new RegExp(`^${key}(?:\\{[^}]*\\})?\\s+([\\d.e+\\-]+)`, "m");
      const m  = metText.match(re);
      return m ? parseFloat(m[1]) : null;
    };

    gpu_cache_usage      = grab("vllm:gpu_cache_usage_perc")   ?? 0;
    num_requests_running = grab("vllm:num_requests_running")    ?? 0;
    num_requests_waiting = grab("vllm:num_requests_waiting")    ?? 0;
    tokens_per_sec       = grab("vllm:avg_generation_throughput_toks_per_s") ?? 0;
    gpu_percent          = gpu_cache_usage * 100;  // cache utilisation ≈ GPU %

    // Attempt to derive VRAM from cache usage + block size metrics
    const totalBlocks = grab("vllm:num_gpu_blocks") ?? 0;
    const blockSizeKV = 16; // typical KV block size in MB — vLLM default
    vram_limit_mb     = totalBlocks > 0 ? Math.round(totalBlocks * blockSizeKV) : 0;
    vram_mb           = Math.round(vram_limit_mb * gpu_cache_usage);

    // Rolling log entry from Prometheus e2e latency histogram if available
    const p50 = grab("vllm:e2e_request_latency_seconds_bucket");  // rough
    if (p50 !== null) {
      const latency_ms = Math.round(p50 * 1000);
      requestLog.push({ ts: now(), latency_ms, error: false });
    }
  } catch { /* metrics endpoint optional */ }

  // 3. Latency probe via /v1/completions
  try {
    const probeStart = now();
    const compRes = await fetch(`${BACKEND_URL}/v1/completions`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        model,
        prompt:     "Hi",
        max_tokens: 1,
        temperature: 0,
      }),
      timeout: 8000,
    });
    probeLatency = now() - probeStart;
    probeError   = !compRes.ok;
  } catch {
    probeError   = true;
    probeLatency = now() - t0;
  }

  requestLog.push({ ts: now(), latency_ms: probeLatency, error: probeError });

  const inference = deriveInferenceStats();

  return {
    timestamp: now(),
    backend:   "vllm",
    model,
    inference: {
      ...inference,
      tokens_per_sec:       Math.round(tokens_per_sec),
    },
    resources: {
      cpu_percent:  null,         // not exposed by vLLM
      gpu_percent,
      mem_mb:       null,
      mem_limit_mb: null,
      vram_mb,
      vram_limit_mb,
    },
    stability: {
      error_rate:   inference.errors_perc,
      timeout_rate: 0,
      uptime_sec:   uptimeSec,
      queue_depth:  num_requests_running + num_requests_waiting,
    },
    health: {
      status: probeError ? "degraded" : "healthy",
      checks: {
        inference:   !probeError,
        gpu_memory:  gpu_cache_usage < 0.95,
        queue:       num_requests_waiting < 50,
      },
    },
    operability: {
      requests_running: num_requests_running,
      requests_waiting: num_requests_waiting,
      gpu_cache_usage,
      last_model: model,
    },
  };
}

// ── Poll loop ─────────────────────────────────────────────────────────────────
async function poll() {
  try {
    latestSnapshot = BACKEND === "vllm"
      ? await fetchVLLM()
      : await fetchOllama();
  } catch (err) {
    console.error(`[poll] ${BACKEND} fetch failed:`, err.message);
  }
  uptimeSec += 5;
}

// Kick off immediately then every 5 s (matches advisor-backend polling)
poll();
setInterval(poll, 5000);

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/snapshot — consumed by advisor-backend every 5 s
app.get("/api/snapshot", (req, res) => {
  if (!latestSnapshot) {
    return res.status(503).json({ error: "snapshot not ready yet — try again in 5s" });
  }
  res.json(latestSnapshot);
});

// GET /api/health — quick liveness check
app.get("/api/health", (req, res) => {
  res.json({
    status:    latestSnapshot ? "ok" : "starting",
    backend:   BACKEND,
    targetUrl: BACKEND_URL,
    uptime:    uptimeSec,
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✓ Inference adapter listening on :${PORT}`);
  console.log(`  GET http://localhost:${PORT}/api/snapshot`);
});
