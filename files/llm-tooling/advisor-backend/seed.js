// seed.js — run once to initialise the database
// Usage: node seed.js

import Database from "better-sqlite3";

const db = new Database("advisor.db");

// ── Schema ────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS hardware_profiles (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    category         TEXT NOT NULL,       -- cloud-gpu | on-prem | consumer | cpu-only | kubernetes | edge
    provider         TEXT,                -- aws | gcp | azure | nvidia | amd | intel | generic
    gpu_model        TEXT,
    gpu_count        INTEGER DEFAULT 1,
    vram_gb          REAL,
    cpu_cores        INTEGER,
    ram_gb           REAL,
    storage_type     TEXT,                -- nvme | ssd | hdd
    storage_gb       INTEGER,
    network_gbps     REAL,
    cost_per_hour    REAL,               -- USD, 0 for on-prem/owned
    cost_model       TEXT,               -- spot | on-demand | reserved | owned
    max_throughput_tps REAL,
    typical_p95_ms   REAL,
    max_model_params_b REAL,             -- max model size in billions of params
    supports_fp16    INTEGER DEFAULT 1,
    supports_bf16    INTEGER DEFAULT 0,
    supports_fp8     INTEGER DEFAULT 0,
    supports_int8    INTEGER DEFAULT 1,
    supports_int4    INTEGER DEFAULT 1,
    notes            TEXT,
    created_at       TEXT DEFAULT (datetime('now')),
    updated_at       TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS recommendation_sessions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id       TEXT NOT NULL,
    cost_weight      REAL NOT NULL,
    resp_weight      REAL NOT NULL,
    acc_weight       REAL NOT NULL,
    model_id         TEXT,
    backend          TEXT,
    quantization     TEXT,
    context_length   INTEGER,
    inference_snapshot TEXT,             -- JSON blob from /api/snapshot
    top_profile_id   TEXT,
    score            REAL,
    created_at       TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS inference_snapshots (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    captured_at      TEXT DEFAULT (datetime('now')),
    avg_ms           REAL,
    p95_ms           REAL,
    p99_ms           REAL,
    throughput_rps   REAL,
    errors_perc      REAL,
    cpu_percent      REAL,
    mem_mb           REAL,
    mem_limit_mb     REAL,
    raw              TEXT                -- full JSON
  );

  CREATE TABLE IF NOT EXISTS modelforge_configs (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    captured_at      TEXT DEFAULT (datetime('now')),
    model            TEXT,
    backend          TEXT,
    quantization     TEXT,
    dtype            TEXT,
    context_length   INTEGER,
    max_tokens       INTEGER,
    temperature      REAL,
    gpu_count        INTEGER,
    gpu_mem_util     REAL,
    raw              TEXT
  );
`);

// ── Hardware profiles seed data ───────────────────────────────────────────────

const profiles = [
  // ── Cloud GPU — AWS ──
  {
    id: "aws-g5-xlarge",
    name: "AWS g5.xlarge",
    category: "cloud-gpu",
    provider: "aws",
    gpu_model: "NVIDIA A10G",
    gpu_count: 1,
    vram_gb: 24,
    cpu_cores: 4,
    ram_gb: 16,
    storage_type: "nvme",
    storage_gb: 250,
    network_gbps: 10,
    cost_per_hour: 1.006,
    cost_model: "on-demand",
    max_throughput_tps: 45,
    typical_p95_ms: 850,
    max_model_params_b: 13,
    supports_fp16: 1, supports_bf16: 0, supports_fp8: 0, supports_int8: 1, supports_int4: 1,
    notes: "Good single-GPU entry point for models up to 13B. Spot price ~$0.30/hr."
  },
  {
    id: "aws-g5-12xlarge",
    name: "AWS g5.12xlarge",
    category: "cloud-gpu",
    provider: "aws",
    gpu_model: "NVIDIA A10G × 4",
    gpu_count: 4,
    vram_gb: 96,
    cpu_cores: 48,
    ram_gb: 192,
    storage_type: "nvme",
    storage_gb: 3800,
    network_gbps: 40,
    cost_per_hour: 5.672,
    cost_model: "on-demand",
    max_throughput_tps: 160,
    typical_p95_ms: 420,
    max_model_params_b: 70,
    supports_fp16: 1, supports_bf16: 0, supports_fp8: 0, supports_int8: 1, supports_int4: 1,
    notes: "4× A10G with NVLink. Handles 70B at Q4. Spot price ~$1.70/hr."
  },
  {
    id: "aws-p4d-24xlarge",
    name: "AWS p4d.24xlarge",
    category: "cloud-gpu",
    provider: "aws",
    gpu_model: "NVIDIA A100 80GB × 8",
    gpu_count: 8,
    vram_gb: 640,
    cpu_cores: 96,
    ram_gb: 1152,
    storage_type: "nvme",
    storage_gb: 8000,
    network_gbps: 400,
    cost_per_hour: 32.77,
    cost_model: "on-demand",
    max_throughput_tps: 680,
    typical_p95_ms: 180,
    max_model_params_b: 405,
    supports_fp16: 1, supports_bf16: 1, supports_fp8: 0, supports_int8: 1, supports_int4: 1,
    notes: "8× A100 with 400Gbps EFA. Full precision 70B, multi-model serving."
  },
  {
    id: "aws-p5-48xlarge",
    name: "AWS p5.48xlarge",
    category: "cloud-gpu",
    provider: "aws",
    gpu_model: "NVIDIA H100 SXM5 × 8",
    gpu_count: 8,
    vram_gb: 640,
    cpu_cores: 192,
    ram_gb: 2048,
    storage_type: "nvme",
    storage_gb: 30720,
    network_gbps: 3200,
    cost_per_hour: 98.32,
    cost_model: "on-demand",
    max_throughput_tps: 1400,
    typical_p95_ms: 90,
    max_model_params_b: 405,
    supports_fp16: 1, supports_bf16: 1, supports_fp8: 1, supports_int8: 1, supports_int4: 1,
    notes: "Highest throughput available on AWS. FP8 support. Reserved saves ~45%."
  },
  // ── Cloud GPU — GCP ──
  {
    id: "gcp-a2-highgpu-1g",
    name: "GCP a2-highgpu-1g",
    category: "cloud-gpu",
    provider: "gcp",
    gpu_model: "NVIDIA A100 40GB",
    gpu_count: 1,
    vram_gb: 40,
    cpu_cores: 12,
    ram_gb: 85,
    storage_type: "ssd",
    storage_gb: 0,
    network_gbps: 24,
    cost_per_hour: 3.673,
    cost_model: "on-demand",
    max_throughput_tps: 95,
    typical_p95_ms: 380,
    max_model_params_b: 34,
    supports_fp16: 1, supports_bf16: 1, supports_fp8: 0, supports_int8: 1, supports_int4: 1,
    notes: "Single A100 40GB. Good for 34B full precision or 70B quantized."
  },
  {
    id: "gcp-a3-highgpu-8g",
    name: "GCP a3-highgpu-8g",
    category: "cloud-gpu",
    provider: "gcp",
    gpu_model: "NVIDIA H100 80GB × 8",
    gpu_count: 8,
    vram_gb: 640,
    cpu_cores: 208,
    ram_gb: 1872,
    storage_type: "ssd",
    storage_gb: 0,
    network_gbps: 3200,
    cost_per_hour: 89.50,
    cost_model: "on-demand",
    max_throughput_tps: 1350,
    typical_p95_ms: 95,
    max_model_params_b: 405,
    supports_fp16: 1, supports_bf16: 1, supports_fp8: 1, supports_int8: 1, supports_int4: 1,
    notes: "GCP flagship LLM node. H100 with 3.2Tbps inter-GPU fabric."
  },
  // ── Cloud GPU — Azure ──
  {
    id: "azure-nc24ads-a100",
    name: "Azure NC24ads A100 v4",
    category: "cloud-gpu",
    provider: "azure",
    gpu_model: "NVIDIA A100 80GB",
    gpu_count: 1,
    vram_gb: 80,
    cpu_cores: 24,
    ram_gb: 220,
    storage_type: "nvme",
    storage_gb: 1123,
    network_gbps: 40,
    cost_per_hour: 3.676,
    cost_model: "on-demand",
    max_throughput_tps: 110,
    typical_p95_ms: 340,
    max_model_params_b: 70,
    supports_fp16: 1, supports_bf16: 1, supports_fp8: 0, supports_int8: 1, supports_int4: 1,
    notes: "Single A100 80GB. Full-precision 70B fits in one node."
  },
  {
    id: "azure-nd96amsr-a100",
    name: "Azure ND96amsr A100 v4",
    category: "cloud-gpu",
    provider: "azure",
    gpu_model: "NVIDIA A100 80GB × 8",
    gpu_count: 8,
    vram_gb: 640,
    cpu_cores: 96,
    ram_gb: 900,
    storage_type: "nvme",
    storage_gb: 6400,
    network_gbps: 800,
    cost_per_hour: 27.197,
    cost_model: "on-demand",
    max_throughput_tps: 720,
    typical_p95_ms: 170,
    max_model_params_b: 405,
    supports_fp16: 1, supports_bf16: 1, supports_fp8: 0, supports_int8: 1, supports_int4: 1,
    notes: "8× A100 80GB with InfiniBand. Strong multi-model serving."
  },
  // ── Consumer / Prosumer ──
  {
    id: "consumer-rtx4090",
    name: "NVIDIA RTX 4090",
    category: "consumer",
    provider: "nvidia",
    gpu_model: "NVIDIA RTX 4090",
    gpu_count: 1,
    vram_gb: 24,
    cpu_cores: 0,
    ram_gb: 0,
    storage_type: "nvme",
    storage_gb: 0,
    network_gbps: 0,
    cost_per_hour: 0,
    cost_model: "owned",
    max_throughput_tps: 38,
    typical_p95_ms: 950,
    max_model_params_b: 13,
    supports_fp16: 1, supports_bf16: 0, supports_fp8: 0, supports_int8: 1, supports_int4: 1,
    notes: "Best consumer GPU for local inference. Great for dev/test up to 13B."
  },
  {
    id: "consumer-rtx4090-x2",
    name: "2× NVIDIA RTX 4090",
    category: "consumer",
    provider: "nvidia",
    gpu_model: "NVIDIA RTX 4090 × 2",
    gpu_count: 2,
    vram_gb: 48,
    cpu_cores: 0,
    ram_gb: 0,
    storage_type: "nvme",
    storage_gb: 0,
    network_gbps: 0,
    cost_per_hour: 0,
    cost_model: "owned",
    max_throughput_tps: 65,
    typical_p95_ms: 650,
    max_model_params_b: 34,
    supports_fp16: 1, supports_bf16: 0, supports_fp8: 0, supports_int8: 1, supports_int4: 1,
    notes: "Dual 4090 via PCIe. 48GB VRAM. Handles 34B comfortably. llama.cpp recommended."
  },
  // ── CPU-only ──
  {
    id: "cpu-epyc-9654",
    name: "AMD EPYC 9654 (CPU-only)",
    category: "cpu-only",
    provider: "amd",
    gpu_model: null,
    gpu_count: 0,
    vram_gb: 0,
    cpu_cores: 96,
    ram_gb: 384,
    storage_type: "nvme",
    storage_gb: 3800,
    network_gbps: 25,
    cost_per_hour: 0,
    cost_model: "owned",
    max_throughput_tps: 8,
    typical_p95_ms: 6500,
    max_model_params_b: 70,
    supports_fp16: 0, supports_bf16: 0, supports_fp8: 0, supports_int8: 1, supports_int4: 1,
    notes: "CPU inference only. GGUF Q4 essential. Good for batch/async, poor for real-time."
  },
  {
    id: "cpu-xeon-platinum",
    name: "Intel Xeon Platinum 8490H (CPU-only)",
    category: "cpu-only",
    provider: "intel",
    gpu_model: null,
    gpu_count: 0,
    vram_gb: 0,
    cpu_cores: 60,
    ram_gb: 512,
    storage_type: "nvme",
    storage_gb: 3800,
    network_gbps: 25,
    cost_per_hour: 0,
    cost_model: "owned",
    max_throughput_tps: 6,
    typical_p95_ms: 8000,
    max_model_params_b: 70,
    supports_fp16: 0, supports_bf16: 0, supports_fp8: 0, supports_int8: 1, supports_int4: 1,
    notes: "AMX instructions accelerate INT8. Best for cost-constrained batch workloads."
  },
  // ── Kubernetes GPU pools ──
  {
    id: "k8s-gpu-pool-a10g",
    name: "Kubernetes GPU pool (A10G)",
    category: "kubernetes",
    provider: "generic",
    gpu_model: "NVIDIA A10G",
    gpu_count: 4,
    vram_gb: 96,
    cpu_cores: 64,
    ram_gb: 256,
    storage_type: "ssd",
    storage_gb: 1000,
    network_gbps: 25,
    cost_per_hour: 4.024,
    cost_model: "on-demand",
    max_throughput_tps: 140,
    typical_p95_ms: 480,
    max_model_params_b: 70,
    supports_fp16: 1, supports_bf16: 0, supports_fp8: 0, supports_int8: 1, supports_int4: 1,
    notes: "4-node A10G pool with autoscaling. vLLM + K8s operator recommended."
  },
  {
    id: "k8s-gpu-pool-a100",
    name: "Kubernetes GPU pool (A100)",
    category: "kubernetes",
    provider: "generic",
    gpu_model: "NVIDIA A100 80GB",
    gpu_count: 4,
    vram_gb: 320,
    cpu_cores: 128,
    ram_gb: 512,
    storage_type: "nvme",
    storage_gb: 4000,
    network_gbps: 100,
    cost_per_hour: 14.70,
    cost_model: "on-demand",
    max_throughput_tps: 440,
    typical_p95_ms: 220,
    max_model_params_b: 405,
    supports_fp16: 1, supports_bf16: 1, supports_fp8: 0, supports_int8: 1, supports_int4: 1,
    notes: "Production K8s with A100s. HPA + KEDA for queue-depth autoscaling."
  },
  // ── On-prem bare metal ──
  {
    id: "onprem-dgx-a100",
    name: "NVIDIA DGX A100",
    category: "on-prem",
    provider: "nvidia",
    gpu_model: "NVIDIA A100 80GB × 8",
    gpu_count: 8,
    vram_gb: 640,
    cpu_cores: 128,
    ram_gb: 2048,
    storage_type: "nvme",
    storage_gb: 30000,
    network_gbps: 400,
    cost_per_hour: 0,
    cost_model: "owned",
    max_throughput_tps: 750,
    typical_p95_ms: 160,
    max_model_params_b: 405,
    supports_fp16: 1, supports_bf16: 1, supports_fp8: 0, supports_int8: 1, supports_int4: 1,
    notes: "Purpose-built LLM server. ~$200K capex. Best TCO at sustained high load."
  },
  {
    id: "onprem-dgx-h100",
    name: "NVIDIA DGX H100",
    category: "on-prem",
    provider: "nvidia",
    gpu_model: "NVIDIA H100 SXM5 × 8",
    gpu_count: 8,
    vram_gb: 640,
    cpu_cores: 112,
    ram_gb: 2048,
    storage_type: "nvme",
    storage_gb: 30000,
    network_gbps: 3200,
    cost_per_hour: 0,
    cost_model: "owned",
    max_throughput_tps: 1450,
    typical_p95_ms: 85,
    max_model_params_b: 405,
    supports_fp16: 1, supports_bf16: 1, supports_fp8: 1, supports_int8: 1, supports_int4: 1,
    notes: "State of the art on-prem. FP8 + NVLink 4. ~$300K capex."
  },
  // ── Edge ──
  {
    id: "edge-jetson-agx-orin",
    name: "NVIDIA Jetson AGX Orin",
    category: "edge",
    provider: "nvidia",
    gpu_model: "Ampere 2048-core",
    gpu_count: 1,
    vram_gb: 64,
    cpu_cores: 12,
    ram_gb: 64,
    storage_type: "nvme",
    storage_gb: 64,
    network_gbps: 1,
    cost_per_hour: 0,
    cost_model: "owned",
    max_throughput_tps: 12,
    typical_p95_ms: 3200,
    max_model_params_b: 7,
    supports_fp16: 1, supports_bf16: 0, supports_fp8: 0, supports_int8: 1, supports_int4: 1,
    notes: "Edge AI. Models up to 7B with Q4. 15W–60W power envelope."
  }
];

const insert = db.prepare(`
  INSERT OR REPLACE INTO hardware_profiles (
    id, name, category, provider, gpu_model, gpu_count, vram_gb,
    cpu_cores, ram_gb, storage_type, storage_gb, network_gbps,
    cost_per_hour, cost_model, max_throughput_tps, typical_p95_ms,
    max_model_params_b, supports_fp16, supports_bf16, supports_fp8,
    supports_int8, supports_int4, notes
  ) VALUES (
    @id, @name, @category, @provider, @gpu_model, @gpu_count, @vram_gb,
    @cpu_cores, @ram_gb, @storage_type, @storage_gb, @network_gbps,
    @cost_per_hour, @cost_model, @max_throughput_tps, @typical_p95_ms,
    @max_model_params_b, @supports_fp16, @supports_bf16, @supports_fp8,
    @supports_int8, @supports_int4, @notes
  )
`);

const insertMany = db.transaction((rows) => {
  for (const row of rows) insert.run(row);
});

insertMany(profiles);

console.log(`✓ Seeded ${profiles.length} hardware profiles`);
console.log("✓ advisor.db ready");

db.close();
