![Open Source](https://badgen.net/badge/open/source/)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)
# LLM Inference Monitor

> A single-pane-of-glass observability dashboard for LLM inference workloads running on z/OS. Covers all 8 metric categories: performance, throughput, resource use, cost, stability, operability, security, and z/OS integration.

---

## Quick Start

Scaffold the project the same way as ModelForge:

```bash
npm create vite@latest llm-monitor -- --template react
cd llm-monitor
npm install
cp ~/Downloads/Dashboard.jsx src/App.jsx
npm run dev
```

Open **http://localhost:5173** — the dashboard runs immediately on mock data.

---

## Switching to Real Data

The dashboard polls a single endpoint every 5 seconds. To connect it to the backend, open `App.jsx` and find the `update` function inside the `useEffect` block. Replace the mock call:

```js
// Before: mock data
const s = mockSnapshot(prevRef.current);
```

```js
// After: real backend
const s = await fetch('/api/snapshot').then(r => r.json());
```


---

## Expected API Response Shape

```json
{
  "timestamp": 1712000000000,
  "inference": {
    "avg_ms": 142.3,
    "p95_ms": 310.1,
    "p99_ms": 520.4,
    "throughput_rps": 38.4,
    "errors_perc": 0.4
  },
  "resources": {
    "cpu_percent": 61.2,
    "mem_mb": 4820,
    "mem_limit_mb": 8192
  },
  "cost": {
    "mips": 325,
    "ziip_percent": 82,
    "four_hour_avg_mips": 301
  },
  "stability": {
    "error_rate": 0.4,
    "timeout_rate": 0.08,
    "uptime_sec": 86400
  },
  "operability": {
    "startup_ms": 2340,
    "last_restart": "2h 14m ago",
    "log_lines_per_min": 42
  },
  "security": {
    "namespace": "llm-prod",
    "egress": "zos-only",
    "service_account": "llm-infer-sa",
    "token_age_sec": 412,
    "token_limit_sec": 600
  },
  "integration": {
    "zos_rest": {
      "success_rate": 99.2,
      "avg_latency_ms": 18,
      "timeout_count": 1
    }
  },
  "health": {
    "status": "healthy",
    "checks": {
      "inference": true,
      "zos": true,
      "iam": true,
      "memory": true
    }
  }
}
```

---

## How to Collect Each Metric

### Inference: `inference.js`

Wrap every model call with `recordInference()` and call `snapshotInference(5)` in `/api/snapshot` handler to flush the 5-second window.

```js
import { recordInference, snapshotInference } from './inference.js'

// Around every model call
const start = Date.now()
const ok = await callModel(prompt)
recordInference(Date.now() - start, ok)

// In the snapshot handler
inference: snapshotInference(5)
```

---

### Resources: `resource-collector.js`

Needed updating, `parseCpu` and `parseMem` implemented. Here is a working version now:

```js
import fs from 'fs'

export function cpuUsage() {
  const lines = fs.readFileSync('/proc/stat', 'utf8').split('\n')
  const parts = lines[0].trim().split(/\s+/).slice(1).map(Number)
  const [user, nice, system, idle, iowait, irq, softirq] = parts
  const total = parts.reduce((a, b) => a + b, 0)
  const used  = total - idle - (iowait || 0)
  return parseFloat(((used / total) * 100).toFixed(1))
}

export function memUsageMb() {
  const mem   = fs.readFileSync('/proc/meminfo', 'utf8')
  const total = parseInt(mem.match(/MemTotal:\s+(\d+)/)[1])
  const avail = parseInt(mem.match(/MemAvailable:\s+(\d+)/)[1])
  return Math.round((total - avail) / 1024)
}
```

> **Note:** `/proc/stat` and `/proc/meminfo` are Linux-only. On z/OS, use the equivalent USS file system paths or query SMF records via existing tooling.

---

### Cost: MIPS & zIIP

MIPS and zIIP data come from SMF (System Management Facility) records, specifically **SMF Type 70** for CPU activity. Feed these into the snapshot via existing `cost.js` config or a live SMF reader:

```js
export function getCostSnapshot() {
  // Pull from SMF Type 70 pipeline or RMF DDS feed
  return {
    mips: smf.currentMips(),
    ziip_percent: smf.ziipOffloadPercent(),
    four_hour_avg_mips: smf.rollingAvgMips(4 * 3600),
  }
}
```

If you are using **RMF Monitor III**, its DDS REST API can be polled directly it returns MIPS and zIIP as JSON fields under the `CPUACT` report.

---

### Stability

Stability metrics come directly out of `snapshotInference()`, `error_rate` and `timeout_rate` are already tracked by `inference.js` error counter. Uptime can be derived from the process start time:

```js
const START = Date.now()

export function getStability(intervalSec) {
  const snap = snapshotInference(intervalSec)
  return {
    error_rate:   snap.errors_perc,
    timeout_rate: snap.timeout_rate ?? 0,
    uptime_sec:   Math.floor((Date.now() - START) / 1000),
  }
}
```

---

### Operability

Startup time is best captured once at boot and stored in memory. Log rate can be measured by counting emitted log lines per interval:

```js
let logCount = 0
let startupMs = null
const BOOT = Date.now()

export function recordStartup() { startupMs = Date.now() - BOOT }
export function countLog()      { logCount++ }

export function getOperability(intervalSec) {
  const lpm = (logCount / intervalSec) * 60
  logCount = 0
  return {
    startup_ms:        startupMs ?? 0,
    last_restart:      formatUptime(Date.now() - BOOT),
    log_lines_per_min: parseFloat(lpm.toFixed(1)),
  }
}
```

---

### Security: `IAM.js`

To surface live token age, track when the token was last issued and compute the delta:

```js
let tokenIssuedAt = Date.now()
export function refreshToken() { tokenIssuedAt = Date.now() }

export function getSecuritySnapshot() {
  return {
    namespace:       'llm-prod',
    egress:          'zos-only',
    service_account: 'llm-infer-sa',
    token_age_sec:   Math.floor((Date.now() - tokenIssuedAt) / 1000),
    token_limit_sec: 600,
  }
}
```

---

### z/OS Integration: `zos-probe.js`


```js
import { probeZos } from './zos-probe.js'

let probeTotal = 0, probeSuccess = 0, probeTimeouts = 0, probeLatencySum = 0

export async function runProbe(endpoint) {
  const result = await probeZos(endpoint)
  probeTotal++
  probeLatencySum += result.latency_ms
  if (result.ok)      probeSuccess++
  if (result.timeout) probeTimeouts++
}

export function getIntegrationSnapshot() {
  return {
    zos_rest: {
      success_rate:   probeTotal ? (probeSuccess / probeTotal) * 100 : 100,
      avg_latency_ms: probeTotal ? probeLatencySum / probeTotal : 0,
      timeout_count:  probeTimeouts,
    }
  }
}
```

---

## Wiring It All Together in `server.js`

```js
import express from 'express'
import { snapshotInference }     from './inference.js'
import { cpuUsage, memUsageMb }  from './resource-collector.js'
import { getCostSnapshot }        from './cost-collector.js'
import { getSecuritySnapshot }    from './iam.js'
import { getIntegrationSnapshot } from './zos-probe.js'

const MEM_LIMIT_MB = 8192
const START        = Date.now()

const app = express()

app.get('/api/snapshot', async (req, res) => {
  const inference = snapshotInference(5)
  res.json({
    timestamp:   Date.now(),
    inference,
    resources: {
      cpu_percent:  cpuUsage(),
      mem_mb:       memUsageMb(),
      mem_limit_mb: MEM_LIMIT_MB,
    },
    cost:        getCostSnapshot(),
    stability: {
      error_rate:   inference.errors_perc,
      timeout_rate: inference.timeout_rate ?? 0,
      uptime_sec:   Math.floor((Date.now() - START) / 1000),
    },
    operability: getOperability(5),
    security:    getSecuritySnapshot(),
    integration: await getIntegrationSnapshot(),
    health: {
      status: 'healthy',
      checks: {
        inference: inference.avg_ms < 1000,
        zos:       (await getIntegrationSnapshot()).zos_rest.success_rate > 95,
        iam:       getSecuritySnapshot().token_age_sec < 550,
        memory:    memUsageMb() < MEM_LIMIT_MB * 0.9,
      }
    }
  })
})

app.listen(9000, () => console.log('Snapshot API running on :9000'))
```

---

## Project Structure

```
llm-monitor/
├── src/
│   └── App.jsx                  ← Dashboard UI
├── server/
│   ├── server.js                ← Express snapshot API
│   ├── inference.js             ← HDR histogram latency tracking
│   ├── resource-collector.js    ← CPU & memory from /proc
│   ├── cost-collector.js        ← MIPS / zIIP from SMF/RMF
│   ├── iam.js                   ← IAM token age tracking
│   └── zos-probe.js             ← z/OS REST probe
├── index.html
├── package.json
└── vite.config.js
```

---

## Notes

- The dashboard polls `/api/snapshot` every **5 seconds** and maintains a 30-point rolling history for sparklines.
- Health check thresholds (latency < 1000ms, memory < 90%, token age < 550s) are set in `server.js` and can be adjusted to match your SLAs.
- MIPS and zIIP collection require access to SMF Type 70 records or the RMF DDS REST API — coordinate with your z/OS systems team if these feeds are not already exposed.
