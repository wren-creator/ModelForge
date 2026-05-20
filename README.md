![Open Source](https://badgen.net/badge/open/source/)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)
![Node.js](https://img.shields.io/badge/Node.js-v20+-339933?logo=node.js)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)


# llm-tooling

> A self-contained observability and infrastructure planning platform for local and cloud LLM deployments.
> Build configs, watch live metrics, and get scored hardware recommendations — all from a single `docker compose up`.

---

## What's in the box

Five services that wire together automatically:

| Service | Port | What it does |
|---|---|---|
| **ModelForge** | `3000` | UI to build Ollama / vLLM / llama.cpp / LM Studio configs |
| **Inference Monitor** | `3001` | Live observability dashboard — latency, throughput, resource usage |
| **Infra Advisor** | `3002` | Hardware recommendation engine with weighted scoring |
| **Advisor Backend** | `9001` | Central REST API — aggregates configs, snapshots, and scores profiles |
| **Inference Backend** | `9000` | Ollama / vLLM adapter — polls your on-prem instance and feeds live metrics upstream |

```
┌────────────────┐    POST /api/modelforge/config    ┌──────────────────────┐
│  ModelForge    │ ─────────────────────────────────▶│                      │
│  :3000         │                                   │  Advisor Backend     │
└────────────────┘                                   │  :9001               │
                                                     │                      │
┌────────────────┐    GET /api/snapshot (poll 5s)    │  SQLite (WAL)        │
│  Inference     │ ─────────────────────────────────▶│  ├─ hardware_profiles│
│  Backend :9000 │                                   │  ├─ modelforge_configs│
└────────────────┘                                   │  └─ rec_sessions     │
                                                     └──────────┬───────────┘
┌────────────────┐    GET /api/* (proxied via nginx) │
│  Infra Advisor │ ◀───────────────────────────────── ┘
│  :3002         │
└────────────────┘

┌────────────────┐    Standalone (mock or real backend)
│  Inference     │
│  Monitor :3001 │
└────────────────┘
```

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) or Docker Engine + Compose v2
- Node.js v20+ (only needed for local dev outside Docker)

---

## Quick Start

```bash
git clone <your-repo-url> llm-tooling
cd llm-tooling

docker compose up --build
```

All five services will start. Open your browser:

- **ModelForge** → http://localhost:3000
- **Inference Monitor** → http://localhost:3001
- **Infra Advisor** → http://localhost:3002
- **Advisor Backend API** → http://localhost:9001/api/health

The advisor backend seeds its SQLite database automatically on first boot. No manual migrations needed.

---

## Services in detail

### ModelForge — `./modelforge`

A UI for generating ready-to-run configs for four LLM runtimes from a single form. Pick a model, quantization, GPU count, context length, and temperature — the output panel updates in real time.

Supported output formats:

| Backend | Output |
|---|---|
| Ollama | `Modelfile` with `FROM`, `SYSTEM`, `PARAMETER` blocks |
| vLLM | `python -m vllm.entrypoints.openai.api_server` shell command |
| llama.cpp | `llama-server` shell command with GPU layer flags |
| LM Studio | JSON config you can paste into model settings |

When you finalize a config, POST it to the Advisor Backend so the Infra Advisor can factor it into its recommendations:

```bash
curl -X POST http://localhost:9001/api/modelforge/config \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama3.1:8b",
    "backend": "Ollama",
    "quantization": "q4_k_m",
    "contextLength": 4096,
    "gpuCount": 1,
    "gpuMemUtil": 0.9,
    "temperature": 0.7
  }'
```

---

### Inference Monitor — `./inference_monitor`

A real-time observability dashboard that polls your inference backend every 5 seconds and renders live sparklines for:

- Average / P95 latency (ms)
- Throughput (req/s)
- CPU / GPU utilisation (%)
- Tokens per second
- Error rate

Switch between backends (Ollama, vLLM, llama.cpp, LM Studio) using the tab bar at the top. The monitor ships with a mock data generator so it renders immediately — replace the mock call in `src/App.jsx` with a real fetch when your backend is running:

```js
// inference_monitor/src/App.jsx — swap mock for real data
const s = await fetch(`${BACKENDS[backend].endpoint}/api/ps`).then(r => r.json());
// or for generic backends:
const s = await fetch('/api/snapshot').then(r => r.json());
```

The expected snapshot shape (what the Advisor Backend also consumes):

```json
{
  "timestamp": 1715000000000,
  "inference": {
    "avg_ms": 142,
    "p95_ms": 310,
    "p99_ms": 520,
    "throughput_rps": 38.4,
    "errors_perc": 0.4,
    "tokens_per_sec": 1120
  },
  "resources": {
    "cpu_percent": 61,
    "gpu_percent": 78,
    "mem_mb": 4820,
    "mem_limit_mb": 8192,
    "vram_mb": 6140,
    "vram_limit_mb": 8192
  },
  "stability": {
    "error_rate": 0.4,
    "timeout_rate": 0.08,
    "uptime_sec": 86400
  },
  "health": {
    "status": "healthy",
    "checks": { "inference": true, "memory": true }
  }
}
```

---

### Advisor Backend — `./advisor-backend`

The central REST API. Built on Express + better-sqlite3. All state lives in `advisor.db` (SQLite, WAL mode).

#### Environment variables

| Variable | Default | Description |
|---|---|---|
| `INFERENCE_MONITOR_URL` | `http://localhost:9000/api/snapshot` | Where to poll for live inference metrics |
| `PORT` | `9001` | Listening port |

#### REST API reference

```
GET  /api/health                  System health + db profile count + uptime
GET  /api/inference/snapshot      Latest polled inference snapshot
GET  /api/hardware/profiles       All hardware profiles (query: ?category=&provider=)
GET  /api/hardware/categories     Distinct category list for filter UI
GET  /api/modelforge/config/latest Latest ModelForge config received
POST /api/modelforge/config       Ingest a new ModelForge config (body: model config JSON)
POST /api/recommend               Score all profiles against weights + current snapshot
GET  /api/sessions                Recommendation history (last 50)
```

#### POST /api/recommend — body schema

```json
{
  "costWeight": 33,
  "respWeight": 34,
  "accWeight": 33,
  "sessionId": "optional-uuid-for-history",
  "modelConfig": {
    "model": "llama3.1:8b",
    "backend": "vLLM",
    "quantization": "q4_k_m",
    "contextLength": 4096,
    "gpuCount": 1
  }
}
```

The three weights must sum to 100. The engine scores every hardware profile on cost, latency, and precision, then returns the top 6 with composite scores and plain-English insights.

#### Database tables

| Table | Purpose |
|---|---|
| `hardware_profiles` | Seed data — cloud GPU, on-prem, consumer, edge profiles |
| `modelforge_configs` | Every config POSTed from ModelForge |
| `inference_snapshots` | Reserved for persisted snapshot history |
| `recommendation_sessions` | Scored sessions for history + audit |

Seed the database manually (runs automatically in Docker):

```bash
cd advisor-backend
node seed.js
```

---

### Infra Advisor — `./infra-advisor`

The recommendation frontend. Reads from the Advisor Backend every 5 seconds and on weight changes. Three-panel layout:

- **Left** — weight sliders (cost / responsiveness / accuracy), current ModelForge config, system health indicators
- **Centre** — ranked hardware profile cards with composite scores, precision chips, and generated insights; filterable by category
- **Right** — live inference signals from the monitor + selected profile detail

All `/api/*` requests are proxied to `advisor-backend:9001` via nginx in Docker, or via Vite's dev proxy locally.

---

### Inference Backend — `./inference-backend`

A lightweight Node.js adapter that polls your on-prem Ollama or vLLM instance every 5 seconds and exposes `GET /api/snapshot` in the shape the Advisor Backend expects.

#### Environment variables

| Variable | Default | Description |
|---|---|---|
| `BACKEND` | `ollama` | Which backend to poll — `ollama` or `vllm` |
| `BACKEND_URL` | `http://localhost:11434` (Ollama) / `http://localhost:8000` (vLLM) | URL of your running inference instance |
| `PORT` | `9000` | Listening port |

#### How Ollama is polled

- `GET /api/ps` — active model name, VRAM usage, context length
- `POST /api/generate` — minimal single-token probe for real latency and `tokens_per_sec` (via Ollama's `eval_count` / `eval_duration` fields)

#### How vLLM is polled

- `GET /v1/models` — active model name
- `GET /metrics` — Prometheus text format: GPU cache usage, queue depth, generation throughput
- `POST /v1/completions` — minimal single-token probe for real latency

#### Fallback behaviour

The stack stays healthy whether or not your on-prem instance is reachable:

**Level 1 — `inference-backend` (port 9000):** if the probe to Ollama/vLLM fails, the error is caught silently and the poll retries every 5 seconds. `/api/snapshot` returns `503` until the first successful poll.

**Level 2 — `advisor-backend` (port 9001):** if it receives a `503` or network error from `inference-backend`, it falls back to jittered mock data automatically and keeps retrying.

Verify which state you're in at any time:

```bash
curl http://localhost:9001/api/health
```

```json
{
  "status": "ok",
  "inferenceMonitorConnected": true,
  "dbProfiles": 18,
  "uptime": 142.3
}
```

`inferenceMonitorConnected: false` means mock data is active. It flips to `true` automatically once your instance comes up — no restart needed.

#### Wiring it up

Add the `environment` block to the `inference-backend` service in `docker-compose.yml`:

```yaml
  inference-backend:
    image: node:20-alpine
    container_name: inference-backend
    working_dir: /app
    ports:
      - "9000:9000"
    volumes:
      - ./inference-backend:/app
    environment:
      - BACKEND=ollama                                    # or: vllm
      - BACKEND_URL=http://host.docker.internal:11434     # your on-prem host
    command: sh -c "npm install && node server.js"
    restart: unless-stopped
```

Then bring it up:

```bash
docker compose up inference-backend advisor-backend
```

---

## Local development (without Docker)

### Advisor Backend

```bash
cd advisor-backend
npm install
node seed.js          # one-time database seed
node server.js        # starts on :9001
```

### Inference Backend

```bash
cd inference-backend
npm install
BACKEND=ollama BACKEND_URL=http://localhost:11434 node server.js   # starts on :9000
```

### Any frontend (ModelForge / Inference Monitor / Infra Advisor)

```bash
cd modelforge          # or inference_monitor / infra-advisor
npm install
npm run dev
```

Vite dev servers proxy `/api` to `:9001` automatically via `vite.config.js`.

---

## Connecting a backend AI orchestrator

The Advisor Backend is designed to be a data source for an AI orchestrator — something like an agent loop, a LangGraph graph, or a Claude/GPT tool-use integration. Here's the full picture of how to wire one in.

### What the orchestrator can read

```
GET  :9001/api/health              → system status + whether real data is flowing
GET  :9001/api/inference/snapshot  → live latency, throughput, resource metrics
GET  :9001/api/hardware/profiles   → full catalogue of scored hardware
POST :9001/api/recommend           → run the scoring engine with custom weights
GET  :9001/api/sessions            → recommendation history for trend analysis
GET  :9001/api/modelforge/config/latest → current model config
```

### What the orchestrator can write

```
POST :9001/api/modelforge/config   → push a new model config (triggers re-scoring)
POST :9001/api/inference/snapshot  → (add this route) push a live snapshot directly
```

### Example: Claude tool-use integration

Define the Advisor Backend endpoints as tools in your Claude API call. The model can then decide autonomously when to check metrics, when to run recommendations, and what to advise.

```js
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const ADVISOR = "http://localhost:9001/api";

const tools = [
  {
    name: "get_inference_snapshot",
    description: "Get live inference metrics: latency, throughput, error rate, resource use.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_hardware_recommendations",
    description: "Score all hardware profiles against priority weights and the current model config.",
    input_schema: {
      type: "object",
      properties: {
        costWeight: { type: "number", description: "Cost priority 0-100" },
        respWeight: { type: "number", description: "Latency priority 0-100" },
        accWeight:  { type: "number", description: "Precision priority 0-100" },
      },
      required: ["costWeight", "respWeight", "accWeight"],
    },
  },
  {
    name: "push_model_config",
    description: "Save a new model configuration to the advisor so recommendations update.",
    input_schema: {
      type: "object",
      properties: {
        model:         { type: "string" },
        backend:       { type: "string", enum: ["Ollama", "vLLM", "llama.cpp", "LM Studio"] },
        quantization:  { type: "string" },
        contextLength: { type: "number" },
        gpuCount:      { type: "number" },
      },
      required: ["model", "backend"],
    },
  },
];

async function callTool(name, input) {
  if (name === "get_inference_snapshot") {
    return fetch(`${ADVISOR}/inference/snapshot`).then(r => r.json());
  }
  if (name === "get_hardware_recommendations") {
    return fetch(`${ADVISOR}/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then(r => r.json());
  }
  if (name === "push_model_config") {
    return fetch(`${ADVISOR}/modelforge/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then(r => r.json());
  }
}

async function runAdvisorAgent(userQuery) {
  const messages = [{ role: "user", content: userQuery }];

  while (true) {
    const response = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      tools,
      messages,
    });

    if (response.stop_reason === "end_turn") {
      return response.content.find(b => b.type === "text")?.text;
    }

    // Process tool calls
    const toolUseBlocks = response.content.filter(b => b.type === "tool_use");
    const toolResults = await Promise.all(
      toolUseBlocks.map(async (block) => ({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(await callTool(block.name, block.input)),
      }))
    );

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });
  }
}

// Usage
const advice = await runAdvisorAgent(
  "My P95 latency is too high and I'm cost-sensitive. " +
  "Check current metrics and recommend the best hardware for a 13B model at Q4."
);
console.log(advice);
```

### Example: Adding a `/api/inference/snapshot` POST route

If your orchestrator wants to push metrics directly instead of the Advisor Backend polling them, add this route to `advisor-backend/server.js`:

```js
// POST /api/inference/snapshot — orchestrator pushes live metrics
app.post("/api/inference/snapshot", (req, res) => {
  const snap = req.body;
  if (!snap || !snap.inference) {
    return res.status(400).json({ error: "snapshot.inference required" });
  }
  latestInferenceSnapshot = { ...snap, _mock: false, _pushed: true };
  res.json({ ok: true });
});
```

Your orchestrator can then push on any schedule it likes — every request, every N seconds, or on anomaly detection.

### Example: LangGraph / LangChain agent

```python
from langchain_core.tools import tool
import requests

ADVISOR = "http://localhost:9001/api"

@tool
def get_inference_snapshot() -> dict:
    """Get live inference metrics from the LLM deployment."""
    return requests.get(f"{ADVISOR}/inference/snapshot").json()

@tool
def get_hardware_recommendations(cost_weight: int, resp_weight: int, acc_weight: int) -> dict:
    """Score hardware profiles. Weights must sum to 100."""
    return requests.post(f"{ADVISOR}/recommend", json={
        "costWeight": cost_weight,
        "respWeight": resp_weight,
        "accWeight": acc_weight,
    }).json()

# Wire into your graph / agent executor as normal LangChain tools
```

### Recommended orchestrator patterns

**Pattern 1 — Alert-driven:** orchestrator subscribes to metric thresholds. When P95 > SLA, it calls `get_hardware_recommendations` with high `respWeight` and surfaces the top result to an ops channel.

**Pattern 2 — Scheduled review:** nightly cron calls `get_inference_snapshot` + `get_hardware_recommendations`, writes the session to `/api/sessions`, and emails a summary if the top recommendation has changed.

**Pattern 3 — Config-aware re-scoring:** whenever a new model is deployed, the CI/CD pipeline POSTs the config to `/api/modelforge/config` and immediately calls `/api/recommend` to pre-compute and log the best hardware for that specific model + quantization combination.

**Pattern 4 — Conversational advisor:** expose the tool set above to a Claude/GPT assistant that ops engineers can query in Slack — "what's our current p95?" / "should we move to a g5.12xlarge?" — the model handles intent, the Advisor Backend handles data.

---

## Project structure

```
llm-tooling/
├── docker-compose.yml          ← Orchestrates all five services
│
├── modelforge/                 ← Config builder UI (React + Vite)
│   ├── src/App.jsx
│   ├── Dockerfile
│   └── package.json
│
├── inference_monitor/          ← Live observability dashboard (React + Vite)
│   ├── src/App.jsx
│   ├── Dockerfile
│   └── package.json
│
├── infra-advisor/              ← Hardware recommendation UI (React + Vite)
│   ├── src/App.jsx
│   ├── nginx.conf              ← Proxies /api/* to advisor-backend:9001
│   ├── Dockerfile
│   └── package.json
│
├── advisor-backend/            ← Central REST API (Express + SQLite)
│   ├── server.js               ← Routes, scoring engine, inference poller
│   ├── seed.js                 ← DB schema + hardware profile seed data
│   ├── package.json
│   └── Dockerfile
│
└── inference-backend/          ← Ollama / vLLM → /api/snapshot adapter
    ├── server.js               ← Polls your on-prem instance, exposes GET /api/snapshot
    └── package.json
```

---

## Hardware profile categories

The seed data covers five categories you can filter on in the Infra Advisor:

| Category | Examples |
|---|---|
| `cloud-gpu` | AWS g5, p4d, p5 — NVIDIA A10G, A100, H100 |
| `on-prem` | NVIDIA DGX H100, workstation GPU rigs |
| `consumer` | RTX 4090, RTX 3090 |
| `cpu-only` | High-core-count CPU inference (llama.cpp CPU mode) |
| `edge` | NVIDIA Jetson AGX Orin |

Add your own profiles by inserting into `hardware_profiles` directly or extending `seed.js`.

---

## Scoring engine

The `POST /api/recommend` engine scores every profile on three axes:

- **Cost score** — inversely proportional to `cost_per_hour`; owned hardware scores maximum
- **Responsiveness score** — based on `typical_p95_ms` vs current live P95 from the snapshot
- **Accuracy score** — based on VRAM capacity relative to model size × quantization bytes-per-param

Each axis is 0–100. The composite score is a weighted sum using your `costWeight / respWeight / accWeight` sliders. Profiles are ranked by composite and the top 6 returned with plain-English insights.

---

## Contributing

PRs welcome. Open an issue first for anything large.

---

## License

MIT
