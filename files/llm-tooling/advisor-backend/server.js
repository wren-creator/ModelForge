// advisor-backend/server.js
// Central aggregator for ModelForge + Inference Monitor → Infrastructure Advisor
// Port 9001

import express from "express";
import cors from "cors";
import Database from "better-sqlite3";
import cron from "node-cron";
import fetch from "node-fetch";

const app = express();
const PORT = 9001;

// ── Database ──────────────────────────────────────────────────────────────────
const db = new Database("advisor.db");
db.pragma("journal_mode = WAL");

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Config ────────────────────────────────────────────────────────────────────
const INFERENCE_MONITOR_URL =
  process.env.INFERENCE_MONITOR_URL || "http://localhost:9000/api/snapshot";

// Fallback mock snapshot when inference monitor is not yet connected
function mockInferenceSnapshot() {
  const jitter = (base, pct) => base * (1 + (Math.random() - 0.5) * pct);
  return {
    timestamp: Date.now(),
    inference: {
      avg_ms: jitter(142, 0.15),
      p95_ms: jitter(310, 0.2),
      p99_ms: jitter(520, 0.25),
      throughput_rps: jitter(38.4, 0.1),
      errors_perc: jitter(0.4, 0.5),
    },
    resources: {
      cpu_percent: jitter(61, 0.12),
      mem_mb: jitter(4820, 0.05),
      mem_limit_mb: 8192,
    },
    cost: {
      mips: jitter(325, 0.08),
      ziip_percent: jitter(82, 0.04),
      four_hour_avg_mips: jitter(301, 0.06),
    },
    stability: {
      error_rate: jitter(0.4, 0.5),
      timeout_rate: jitter(0.08, 0.6),
      uptime_sec: 86400,
    },
    health: {
      status: "healthy",
      checks: { inference: true, memory: true },
    },
    _mock: true,
  };
}

// ── Inference snapshot polling ────────────────────────────────────────────────
let latestInferenceSnapshot = mockInferenceSnapshot();

async function pollInferenceMonitor() {
  try {
    const res = await fetch(INFERENCE_MONITOR_URL, { timeout: 4000 });
    if (res.ok) {
      latestInferenceSnapshot = await res.json();
    }
  } catch {
    // Inference monitor not available — keep using last known or mock
    if (!latestInferenceSnapshot) {
      latestInferenceSnapshot = mockInferenceSnapshot();
    }
  }
}

// Poll every 5 seconds (matches inference monitor refresh rate)
cron.schedule("*/5 * * * * *", pollInferenceMonitor);
pollInferenceMonitor();

// ── Scoring engine ────────────────────────────────────────────────────────────
function scoreProfile(profile, weights, snapshot, modelCfg) {
  const { cost: cw, resp: rw, acc: aw } = weights;
  const total = cw + rw + aw || 1;

  // ── Cost score (0-100) ───
  // Lower cost_per_hour = higher score. Owned = max score on cost.
  let costScore;
  if (profile.cost_model === "owned") {
    costScore = 100;
  } else {
    // Scale: $0 = 100, $100+/hr = 0
    costScore = Math.max(0, 100 - profile.cost_per_hour);
  }

  // ── Responsiveness score (0-100) ───
  // Based on typical_p95_ms vs current observed p95
  const currentP95 = snapshot?.inference?.p95_ms ?? 500;
  const targetP95 = currentP95 * 0.6; // aim to improve by 40%
  const p95Ratio = profile.typical_p95_ms / Math.max(targetP95, 50);
  const respScore = Math.max(0, Math.min(100, 100 - (p95Ratio - 1) * 40));

  // ── Throughput bonus — if queue is backing up, reward high-tps profiles
  const currentTps = snapshot?.inference?.throughput_rps ?? 40;
  const tpsRatio = Math.min(profile.max_throughput_tps / Math.max(currentTps, 1), 3);
  const tpsBonus = Math.min(20, (tpsRatio - 1) * 10);

  // ── Accuracy score (0-100) ───
  // Proxy: supports higher precision formats, more VRAM, less quantization forced
  let accScore = 50;
  if (profile.supports_fp8) accScore += 20;
  if (profile.supports_bf16) accScore += 15;
  if (profile.supports_fp16) accScore += 10;
  if (profile.vram_gb >= 80) accScore += 15;
  else if (profile.vram_gb >= 40) accScore += 8;

  // If current model config forces heavy quantization due to VRAM, penalise
  if (modelCfg) {
    const modelVramNeeded = estimateVramNeeded(modelCfg);
    if (profile.vram_gb > 0 && profile.vram_gb < modelVramNeeded) {
      accScore -= 20; // can't run desired precision
    }
  }
  accScore = Math.max(0, Math.min(100, accScore));

  // ── Weighted composite ───
  const composite =
    (costScore * (cw / total) +
      (respScore + tpsBonus) * (rw / total) +
      accScore * (aw / total));

  return {
    costScore: Math.round(costScore),
    respScore: Math.round(respScore + tpsBonus),
    accScore: Math.round(accScore),
    composite: Math.round(composite),
  };
}

function estimateVramNeeded(modelCfg) {
  // Rough VRAM estimate based on model name and quantization
  const paramMap = {
    "llama3.2:3b": 3, "llama3.1:8b": 8, "llama3.1:70b": 70,
    "mistral:7b": 7, "mixtral:8x7b": 56, "gemma2:9b": 9,
    "gemma2:27b": 27, "qwen2.5:7b": 7, "qwen2.5:72b": 72,
    "deepseek-r1:8b": 8, "deepseek-r1:70b": 70, "phi4:14b": 14,
  };
  const params = paramMap[modelCfg.model] ?? 8;
  const bytesPerParam = {
    none: 4, fp8: 1, awq: 0.5, gptq: 0.5,
    bitsandbytes: 1, "bitsandbytes-nf4": 0.5,
    q4_k_m: 0.5, q5_k_m: 0.625, q8_0: 1,
  }[modelCfg.quantization] ?? 2;
  return Math.ceil((params * 1e9 * bytesPerParam) / 1e9); // GB
}

function generateInsights(profile, scores, snapshot, weights) {
  const insights = [];
  const { cost: cw, resp: rw, acc: aw } = weights;

  if (scores.costScore >= 75)
    insights.push("Strong cost efficiency — fits budget-conscious deployments.");
  if (scores.respScore >= 75)
    insights.push("Latency improvement expected vs current baseline.");
  if (scores.accScore >= 75)
    insights.push("Supports full or near-full precision — minimal quality loss.");

  const queueDepth = snapshot?.integration?.zos_rest?.timeout_count;
  if (profile.max_throughput_tps > (snapshot?.inference?.throughput_rps ?? 0) * 2)
    insights.push("Throughput headroom 2× current demand — handles traffic spikes.");

  if (profile.cost_model === "spot")
    insights.push("Spot pricing available — ~60–70% savings vs on-demand with auto-failover.");
  if (profile.cost_model === "owned")
    insights.push("No hourly cost — capex already sunk. Optimal TCO at sustained load.");

  if (cw > rw && cw > aw && scores.costScore < 50)
    insights.push("⚠ Cost priority is high but this profile is expensive — consider spot or smaller instance.");
  if (rw > cw && rw > aw && scores.respScore < 50)
    insights.push("⚠ Responsiveness is top priority but p95 estimate is still high — consider scaling up.");

  return insights;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/health
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    version: "1.0.0",
    inferenceMonitorConnected: !latestInferenceSnapshot?._mock,
    dbProfiles: db.prepare("SELECT COUNT(*) as n FROM hardware_profiles").get().n,
    uptime: process.uptime(),
  });
});

// GET /api/inference/snapshot — latest aggregated snapshot from inference monitor
app.get("/api/inference/snapshot", (req, res) => {
  res.json(latestInferenceSnapshot);
});

// POST /api/modelforge/config — ModelForge posts its current config here
app.post("/api/modelforge/config", (req, res) => {
  const cfg = req.body;
  if (!cfg || !cfg.model) return res.status(400).json({ error: "model required" });

  db.prepare(`
    INSERT INTO modelforge_configs (model, backend, quantization, dtype, context_length, max_tokens, temperature, gpu_count, gpu_mem_util, raw)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    cfg.model, cfg.backend, cfg.quantization, cfg.dtype,
    cfg.contextLength, cfg.maxTokens || null, cfg.temperature,
    cfg.gpuCount, cfg.gpuMemUtil, JSON.stringify(cfg)
  );

  res.json({ ok: true });
});

// GET /api/modelforge/config/latest — advisor frontend reads current ModelForge config
app.get("/api/modelforge/config/latest", (req, res) => {
  const row = db.prepare("SELECT * FROM modelforge_configs ORDER BY id DESC LIMIT 1").get();
  res.json(row ? JSON.parse(row.raw) : null);
});

// GET /api/hardware/profiles — all hardware profiles
app.get("/api/hardware/profiles", (req, res) => {
  const { category, provider } = req.query;
  let query = "SELECT * FROM hardware_profiles WHERE 1=1";
  const params = [];
  if (category) { query += " AND category = ?"; params.push(category); }
  if (provider) { query += " AND provider = ?"; params.push(provider); }
  query += " ORDER BY cost_per_hour ASC";
  res.json(db.prepare(query).all(...params));
});

// POST /api/recommend — core recommendation engine
app.post("/api/recommend", (req, res) => {
  const { costWeight = 33, respWeight = 33, accWeight = 34, modelConfig, sessionId } = req.body;

  const weights = { cost: costWeight, resp: respWeight, acc: accWeight };
  const snapshot = latestInferenceSnapshot;

  const profiles = db.prepare("SELECT * FROM hardware_profiles").all();

  const scored = profiles
    .map((p) => {
      const scores = scoreProfile(p, weights, snapshot, modelConfig);
      const insights = generateInsights(p, scores, snapshot, weights);
      return { ...p, scores, insights };
    })
    .sort((a, b) => b.scores.composite - a.scores.composite);

  // Persist session
  if (sessionId && scored.length > 0) {
    db.prepare(`
      INSERT INTO recommendation_sessions (session_id, cost_weight, resp_weight, acc_weight, model_id, backend, quantization, context_length, inference_snapshot, top_profile_id, score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId, costWeight, respWeight, accWeight,
      modelConfig?.model, modelConfig?.backend, modelConfig?.quantization,
      modelConfig?.contextLength, JSON.stringify(snapshot),
      scored[0].id, scored[0].scores.composite
    );
  }

  res.json({
    recommendations: scored.slice(0, 6),
    inferenceSnapshot: snapshot,
    modelConfig: modelConfig ?? null,
    scoredAt: new Date().toISOString(),
  });
});

// GET /api/sessions — recommendation history
app.get("/api/sessions", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM recommendation_sessions ORDER BY id DESC LIMIT 50")
    .all();
  res.json(rows);
});

// GET /api/hardware/categories — distinct categories for filter UI
app.get("/api/hardware/categories", (req, res) => {
  const rows = db.prepare("SELECT DISTINCT category FROM hardware_profiles ORDER BY category").all();
  res.json(rows.map((r) => r.category));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✓ Advisor backend running on :${PORT}`);
  console.log(`  Polling inference monitor at ${INFERENCE_MONITOR_URL}`);
  console.log(`  Hardware profiles: ${db.prepare("SELECT COUNT(*) as n FROM hardware_profiles").get().n}`);
});
