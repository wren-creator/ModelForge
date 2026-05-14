import { useState, useEffect, useRef } from "react";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=Barlow:wght@400;500;600;700;800&display=swap');`;

// ── Server backend definitions ────────────────────────────────────────────
const BACKENDS = {
  ollama:   { label: "Ollama",    color: "#00c8ff", endpoint: "http://localhost:11434", costKey: "cpu" },
  vllm:     { label: "vLLM",     color: "#b57bee", endpoint: "http://localhost:8000",  costKey: "gpu" },
  llamacpp: { label: "llama.cpp", color: "#ff7c43", endpoint: "http://localhost:8080",  costKey: "cpu" },
  lmstudio: { label: "LM Studio", color: "#39d98a", endpoint: "http://localhost:1234",  costKey: "gpu" },
  custom:   { label: "Custom",    color: "#f5a623", endpoint: "http://localhost:9000",  costKey: "cpu" },
};

// ── Config profiles for horizontal comparison ─────────────────────────────
const CONFIG_PROFILES = [
  { id: "full", label: "Full Precision", quant: "None",     model: "llama3.1:8b",  color: "#00c8ff", weightGB: 16  },
  { id: "q8",   label: "Q8_0 GGUF",     quant: "Q8_0",     model: "llama3.1:8b",  color: "#b57bee", weightGB: 8.5 },
  { id: "q5",   label: "Q5_K_M GGUF",   quant: "Q5_K_M",   model: "llama3.1:8b",  color: "#39d98a", weightGB: 5.3 },
  { id: "q4",   label: "Q4_K_M GGUF",   quant: "Q4_K_M",   model: "llama3.1:8b",  color: "#f5a623", weightGB: 4.4 },
  { id: "awq",  label: "AWQ Int4",       quant: "AWQ",      model: "llama3.1:8b",  color: "#ff7c43", weightGB: 4.1 },
  { id: "fp8",  label: "FP8",            quant: "FP8",      model: "llama3.1:70b", color: "#ff4d6a", weightGB: 70  },
];

// ── Mock data (replace update() body with real fetch) ─────────────────────
function mockSnapshot(prev, backend) {
  const jitter = (base, pct) => base * (1 + (Math.random() - 0.5) * pct);
  const configSnaps = CONFIG_PROFILES.map(cfg => {
    const latBase  = { full: 220, q8: 175, q5: 148, q4: 130, awq: 125, fp8: 340 }[cfg.id];
    const rpsBase  = { full: 22,  q8: 30,  q5: 38,  q4: 44,  awq: 46,  fp8: 12  }[cfg.id];
    const costBase = { full: 88,  q8: 71,  q5: 58,  q4: 49,  awq: 47,  fp8: 95  }[cfg.id];
    const errBase  = { full: 0.1, q8: 0.2, q5: 0.3, q4: 0.5, awq: 0.6, fp8: 0.4 }[cfg.id];
    return {
      id:             cfg.id,
      avg_ms:         jitter(latBase, 0.12),
      p95_ms:         jitter(latBase * 2.1, 0.18),
      p99_ms:         jitter(latBase * 3.4, 0.22),
      rps:            jitter(rpsBase, 0.1),
      cost_pct:       jitter(costBase, 0.08),
      error_pct:      jitter(errBase, 0.4),
      tokens_per_sec: jitter(rpsBase * 28, 0.1),
    };
  });
  return {
    timestamp: Date.now(),
    backend,
    configs: configSnaps,
    inference: {
      avg_ms:         jitter(142, 0.15),
      p95_ms:         jitter(310, 0.2),
      throughput_rps: jitter(38.4, 0.1),
      errors_perc:    jitter(0.4, 0.5),
      tokens_per_sec: jitter(1120, 0.08),
    },
    resources: {
      cpu_percent:   jitter(61, 0.12),
      gpu_percent:   jitter(78, 0.1),
      mem_mb:        jitter(4820, 0.05),
      mem_limit_mb:  8192,
      vram_mb:       jitter(6140, 0.04),
      vram_limit_mb: 8192,
    },
    cost: {
      cpu_pct:              jitter(61, 0.1),
      gpu_pct:              jitter(78, 0.08),
      cost_per_1k_tokens:   jitter(0.0018, 0.12),
      hourly_est_usd:       jitter(0.043, 0.15),
    },
    stability: {
      error_rate:   jitter(0.4, 0.5),
      timeout_rate: jitter(0.08, 0.6),
      uptime_sec:   (prev?.stability?.uptime_sec ?? 86400) + 5,
    },
    operability: {
      startup_ms:        2340,
      last_restart:      "2h 14m ago",
      log_lines_per_min: jitter(42, 0.2),
      ctx_used:          jitter(2048, 0.3),
      ctx_limit:         4096,
    },
    network: {
      avg_latency_ms: jitter(18, 0.15),
      timeout_count:  Math.floor(jitter(1, 1)),
      success_rate:   jitter(99.2, 0.005),
    },
    health: {
      checks: { inference: true, network: true, memory: true, model: true },
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────
function fmt(n, dec = 1) { return typeof n === "number" ? n.toFixed(dec) : "—"; }
function fmtUptime(sec) {
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}
function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

// ── Sparkline ─────────────────────────────────────────────────────────────
function Sparkline({ history, color = "var(--accent)", height = 36 }) {
  if (!history || history.length < 2) return null;
  const w = 200, h = height;
  const min = Math.min(...history), max = Math.max(...history), range = max - min || 1;
  const pts = history.map((v, i) =>
    `${(i / (history.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`
  ).join(" ");
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      <polyline points={`0,${h} ${pts} ${w},${h}`} fill={color} opacity="0.1" stroke="none" />
    </svg>
  );
}

// ── Horizontal arc gauge ──────────────────────────────────────────────────
function HorizArc({ value, max, color, label, unit = "", decimals = 0, warn, danger }) {
  const pct = clamp(value / max, 0, 1);
  const c   = danger ? "var(--red)" : warn ? "var(--yellow)" : color;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.22rem", flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: "0.52rem", color: "var(--text2)", letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "var(--mono)", whiteSpace: "nowrap" }}>{label}</span>
        <span style={{ fontSize: "0.72rem", fontWeight: 600, color: c, fontFamily: "var(--mono)", marginLeft: "0.5rem" }}>
          {fmt(value, decimals)}<span style={{ fontSize: "0.52rem", color: "var(--text2)", marginLeft: "0.12rem" }}>{unit}</span>
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "var(--border)", overflow: "hidden" }}>
        <div style={{
          width: `${pct * 100}%`, height: "100%", borderRadius: 4,
          background: `linear-gradient(90deg, ${c}77, ${c})`,
          boxShadow: `0 0 8px ${c}55`,
          transition: "width 0.7s cubic-bezier(0.4,0,0.2,1)",
        }} />
      </div>
    </div>
  );
}

// ── MiniBar ───────────────────────────────────────────────────────────────
function MiniBar({ value, max, color = "var(--accent)" }) {
  const pct  = clamp((value / max) * 100, 0, 100);
  const warn = pct > 80;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <div style={{ flex: 1, height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 2, background: warn ? "var(--yellow)" : color, transition: "width 0.6s ease", boxShadow: warn ? "0 0 6px var(--yellow)" : `0 0 6px ${color}` }} />
      </div>
      <span style={{ fontSize: "0.62rem", color: warn ? "var(--yellow)" : "var(--text2)", minWidth: "2.5rem", textAlign: "right", fontFamily: "var(--mono)" }}>{fmt(pct, 0)}%</span>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────
function Card({ title, category, accent = "var(--accent)", children }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", animation: "fadeUp 0.4s ease both" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.55rem 0.85rem", borderBottom: "1px solid var(--border)", background: "var(--surface2)" }}>
        <div style={{ width: 3, height: 13, borderRadius: 2, background: accent, boxShadow: `0 0 8px ${accent}` }} />
        <span style={{ fontSize: "0.58rem", fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text2)" }}>{category}</span>
        <span style={{ marginLeft: "auto", fontSize: "0.6rem", fontWeight: 700, color: accent, letterSpacing: "0.06em" }}>{title}</span>
      </div>
      <div style={{ padding: "0.8rem 0.85rem" }}>{children}</div>
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────
function Row({ label, value, unit = "", accent, dim }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.4rem" }}>
      <span style={{ fontSize: "0.63rem", color: "var(--text2)", letterSpacing: "0.04em" }}>{label}</span>
      <span style={{ fontFamily: "var(--mono)", fontSize: "0.82rem", fontWeight: 600, color: dim ? "var(--text2)" : (accent || "var(--text)") }}>
        {value}<span style={{ fontSize: "0.62rem", color: "var(--text2)", marginLeft: "0.2rem" }}>{unit}</span>
      </span>
    </div>
  );
}

// ── Dot ───────────────────────────────────────────────────────────────────
function Dot({ ok, label }) {
  const c = ok ? "var(--green)" : "var(--red)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.32rem" }}>
      <div style={{ width: 7, height: 7, borderRadius: "50%", background: c, boxShadow: `0 0 6px ${c}`, flexShrink: 0, animation: ok ? "pulse 2s infinite" : "none" }} />
      <span style={{ fontSize: "0.66rem", color: "var(--text)" }}>{label}</span>
      <span style={{ marginLeft: "auto", fontSize: "0.58rem", fontWeight: 600, color: c }}>{ok ? "OK" : "FAIL"}</span>
    </div>
  );
}

// ── Config comparison row (horizontal arc strip) ──────────────────────────
function ConfigRow({ profile, snap, isActive, onClick, isGpu }) {
  if (!snap) return null;
  return (
    <div
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: "176px 1fr 1fr 1fr 1fr 82px",
        gap: "1rem",
        alignItems: "center",
        padding: "0.7rem 1rem",
        background: isActive ? `${profile.color}0e` : "var(--surface)",
        border: `1px solid ${isActive ? profile.color + "55" : "var(--border)"}`,
        borderRadius: 6,
        cursor: "pointer",
        transition: "border-color 0.2s, background 0.2s",
        animation: "fadeUp 0.35s ease both",
      }}
    >
      {/* Identity */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: profile.color, boxShadow: `0 0 6px ${profile.color}`, flexShrink: 0 }} />
          <span style={{ fontFamily: "var(--mono)", fontSize: "0.76rem", fontWeight: 600, color: isActive ? profile.color : "var(--text)" }}>
            {profile.label}
          </span>
          {isActive && (
            <span style={{ fontSize: "0.48rem", fontWeight: 700, letterSpacing: "0.1em", color: profile.color, background: `${profile.color}22`, border: `1px solid ${profile.color}44`, borderRadius: 3, padding: "0.1rem 0.3rem" }}>
              ACTIVE
            </span>
          )}
        </div>
        <span style={{ fontFamily: "var(--mono)", fontSize: "0.57rem", color: "var(--text2)" }}>{profile.model} · {profile.weightGB}GB</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: "0.54rem", color: "var(--text2)", opacity: 0.7 }}>{profile.quant}</span>
      </div>

      <HorizArc value={snap.avg_ms}    max={600} color={profile.color} label="Latency"    unit="ms"  decimals={0} warn={snap.avg_ms > 300}   danger={snap.avg_ms > 500} />
      <HorizArc value={snap.rps}       max={60}  color={profile.color} label="Throughput" unit="r/s" decimals={1} />
      <HorizArc value={snap.cost_pct}  max={100} color={profile.color} label={isGpu ? "GPU %" : "CPU %"} unit="%" decimals={0} warn={snap.cost_pct > 80} danger={snap.cost_pct > 92} />
      <HorizArc value={snap.error_pct} max={2}   color={profile.color} label="Errors"     unit="%" decimals={2} warn={snap.error_pct > 0.5} danger={snap.error_pct > 1} />

      {/* Tok/s */}
      <div style={{ textAlign: "right" }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: "0.82rem", fontWeight: 600, color: profile.color }}>{fmt(snap.tokens_per_sec, 0)}</div>
        <div style={{ fontSize: "0.52rem", color: "var(--text2)", fontFamily: "var(--mono)" }}>tok/s</div>
      </div>
    </div>
  );
}

// ── Backend selector tab ──────────────────────────────────────────────────
function BkTab({ id, def, active, onClick }) {
  return (
    <button
      onClick={() => onClick(id)}
      style={{
        fontFamily: "var(--mono)", fontSize: "0.63rem", fontWeight: 600,
        letterSpacing: "0.08em", padding: "0.32rem 0.7rem",
        borderRadius: 4, border: `1px solid ${active ? def.color + "66" : "var(--border)"}`,
        background: active ? `${def.color}18` : "transparent",
        color: active ? def.color : "var(--text2)",
        cursor: "pointer", transition: "all 0.15s", textTransform: "uppercase",
      }}
    >
      {def.label}
    </button>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [backend,      setBackend]  = useState("ollama");
  const [snap,         setSnap]     = useState(null);
  const [activeConfig, setActive]   = useState("q4");
  const [history,      setHistory]  = useState({ avg: [], p95: [], rps: [], cpu: [], gpu: [] });
  const [tick,         setTick]     = useState(0);
  const prevRef = useRef(null);

  useEffect(() => {
    const update = () => {
      // ── Swap for real backend ─────────────────────────────────────────
      // Ollama:    fetch(`${BACKENDS.ollama.endpoint}/api/ps`)
      // vLLM:      fetch(`${BACKENDS.vllm.endpoint}/metrics`)
      // llama.cpp: fetch(`${BACKENDS.llamacpp.endpoint}/metrics`)
      // LM Studio: fetch(`${BACKENDS.lmstudio.endpoint}/v1/models`)
      // Generic:   fetch('/api/snapshot').then(r => r.json())
      const s = mockSnapshot(prevRef.current, backend);
      prevRef.current = s;
      setSnap(s);
      setHistory(h => ({
        avg: [...h.avg.slice(-59), s.inference.avg_ms],
        p95: [...h.p95.slice(-59), s.inference.p95_ms],
        rps: [...h.rps.slice(-59), s.inference.throughput_rps],
        cpu: [...h.cpu.slice(-59), s.resources.cpu_percent],
        gpu: [...h.gpu.slice(-59), s.resources.gpu_percent],
      }));
      setTick(t => t + 1);
    };
    update();
    const id = setInterval(update, 5000);
    return () => clearInterval(id);
  }, [backend]);

  if (!snap) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#080b0f", color: "#4a6278", fontFamily: "IBM Plex Mono, monospace", fontSize: "0.8rem", letterSpacing: "0.1em" }}>
      INITIALIZING...
    </div>
  );

  const { inference, resources, cost, stability, operability, network, health } = snap;
  const bkDef       = BACKENDS[backend];
  const isGpu       = bkDef.costKey === "gpu";
  const allHealthy  = Object.values(health.checks).every(Boolean);
  const activeSnap  = snap.configs.find(c => c.id === activeConfig);
  const activeProf  = CONFIG_PROFILES.find(p => p.id === activeConfig);

  return (
    <>
      <style>{`
        ${FONTS}
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg:      #080b0f;
          --surface: #0d1117;
          --surface2:#111820;
          --border:  #1a2535;
          --green:   #39d98a;
          --yellow:  #f5a623;
          --red:     #ff4d6a;
          --purple:  #b57bee;
          --orange:  #ff7c43;
          --teal:    #00e8c6;
          --text:    #c9daea;
          --text2:   #4a6278;
          --mono:    'IBM Plex Mono', monospace;
          --sans:    'Barlow', sans-serif;
        }
        body { background: var(--bg); color: var(--text); font-family: var(--sans); margin: 0; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(7px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-track { background:var(--bg); }
        ::-webkit-scrollbar-thumb { background:var(--border); border-radius:2px; }
      `}</style>

      <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "1.1rem 1.25rem" }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", paddingBottom: "0.85rem", borderBottom: "1px solid var(--border)", flexWrap: "wrap", gap: "0.75rem" }}>
          <div>
            <div style={{ fontSize: "0.56rem", fontFamily: "var(--mono)", letterSpacing: "0.18em", color: bkDef.color, marginBottom: "0.2rem" }}>// LLM OBSERVABILITY PLATFORM · by Britley Hoff</div>
            <div style={{ fontFamily: "var(--sans)", fontWeight: 800, fontSize: "1.35rem", letterSpacing: "-0.02em", color: "#e8f4ff" }}>
              INFERENCE <span style={{ color: bkDef.color }}>MONITOR</span>
            </div>
          </div>

          {/* Backend tabs */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.55rem", color: "var(--text2)", letterSpacing: "0.12em", marginRight: "0.2rem" }}>BACKEND</span>
            {Object.entries(BACKENDS).map(([id, def]) => (
              <BkTab key={id} id={id} def={def} active={backend === id} onClick={setBackend} />
            ))}
          </div>

          {/* Health + meta */}
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: "0.58rem", color: "var(--text2)", textAlign: "right" }}>
              <div style={{ marginBottom: "0.1rem" }}>ENDPOINT <span style={{ color: "var(--text)" }}>{bkDef.endpoint}</span></div>
              <div>POLL <span style={{ color: bkDef.color }}>5s</span> · TICK <span style={{ color: bkDef.color }}>#{tick}</span></div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", background: allHealthy ? "rgba(57,217,138,0.08)" : "rgba(255,77,106,0.08)", border: `1px solid ${allHealthy ? "rgba(57,217,138,0.25)" : "rgba(255,77,106,0.25)"}`, borderRadius: 6, padding: "0.38rem 0.75rem" }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: allHealthy ? "var(--green)" : "var(--red)", boxShadow: `0 0 8px ${allHealthy ? "var(--green)" : "var(--red)"}`, animation: "pulse 2s infinite" }} />
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.62rem", fontWeight: 600, color: allHealthy ? "var(--green)" : "var(--red)", letterSpacing: "0.1em" }}>
                {allHealthy ? "HEALTHY" : "DEGRADED"}
              </span>
            </div>
          </div>
        </div>

        {/* ── Live sparkline strip ─────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0.55rem", marginBottom: "1rem" }}>
          {[
            { label: "Avg Latency", hist: history.avg, val: fmt(inference.avg_ms),         unit: "ms",  color: bkDef.color },
            { label: "P95 Latency", hist: history.p95, val: fmt(inference.p95_ms),         unit: "ms",  color: "#f5a623" },
            { label: "Throughput",  hist: history.rps, val: fmt(inference.throughput_rps), unit: "r/s", color: "#00e8c6" },
            { label: isGpu ? "GPU %" : "CPU %", hist: isGpu ? history.gpu : history.cpu, val: fmt(isGpu ? resources.gpu_percent : resources.cpu_percent), unit: "%", color: "#b57bee" },
            { label: "Tokens/sec",  hist: history.rps.map(r => r * 28), val: fmt(inference.tokens_per_sec, 0), unit: "", color: "#39d98a" },
          ].map(({ label, hist, val, unit, color }) => (
            <div key={label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "0.55rem 0.7rem", animation: "fadeUp 0.3s ease both" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.35rem" }}>
                <span style={{ fontSize: "0.53rem", fontFamily: "var(--mono)", color: "var(--text2)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
                <span style={{ fontSize: "0.82rem", fontWeight: 600, color, fontFamily: "var(--mono)" }}>
                  {val}<span style={{ fontSize: "0.55rem", color: "var(--text2)", marginLeft: "0.12rem" }}>{unit}</span>
                </span>
              </div>
              <Sparkline history={hist} color={color} height={30} />
            </div>
          ))}
        </div>

        {/* ── Config comparison table ──────────────────────────────────────── */}
        <div style={{ marginBottom: "1rem" }}>
          {/* Column headers */}
          <div style={{ display: "grid", gridTemplateColumns: "176px 1fr 1fr 1fr 1fr 82px", gap: "1rem", padding: "0 1rem 0.45rem", alignItems: "center" }}>
            {["Config · Model", "Latency (avg ms)", "Throughput (r/s)", isGpu ? "GPU Cost (%)" : "CPU Cost (%)", "Error Rate (%)", "Tok/s"].map((h, i) => (
              <span key={i} style={{ fontSize: "0.55rem", fontFamily: "var(--mono)", color: "var(--text2)", letterSpacing: "0.1em", textTransform: "uppercase", textAlign: i === 5 ? "right" : "left" }}>{h}</span>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {CONFIG_PROFILES.map(profile => (
              <ConfigRow
                key={profile.id}
                profile={profile}
                snap={snap.configs.find(c => c.id === profile.id)}
                isActive={activeConfig === profile.id}
                isGpu={isGpu}
                onClick={() => setActive(profile.id)}
              />
            ))}
          </div>
        </div>

        {/* ── Detail cards for selected config ─────────────────────────────── */}
        <div style={{ marginBottom: "0.75rem" }}>
          <div style={{ fontSize: "0.55rem", fontFamily: "var(--mono)", color: "var(--text2)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: "0.55rem" }}>
            ACTIVE CONFIG DETAIL —{" "}
            <span style={{ color: activeProf?.color }}>{activeProf?.label}</span>
            <span style={{ color: "var(--text2)", marginLeft: "0.5rem" }}>· {activeProf?.model} · {activeProf?.quant}</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(255px, 1fr))", gap: "0.7rem" }}>

            {/* Latency */}
            <Card title="Latency" category="Performance" accent={bkDef.color}>
              {activeSnap && <>
                <Row label="Average" value={fmt(activeSnap.avg_ms, 0)} unit="ms" accent={bkDef.color} />
                <Row label="P95 (est)" value={fmt(activeSnap.p95_ms, 0)} unit="ms" />
                <Row label="P99 (est)" value={fmt(activeSnap.p99_ms, 0)} unit="ms" />
              </>}
              <div style={{ marginTop: "0.55rem" }}><Sparkline history={history.avg} color={bkDef.color} height={30} /></div>
              <div style={{ fontSize: "0.52rem", color: "var(--text2)", marginTop: "0.2rem", fontFamily: "var(--mono)" }}>60-point rolling trace</div>
            </Card>

            {/* Resources */}
            <Card title="Resources" category={isGpu ? "GPU + Memory" : "CPU + Memory"} accent="#b57bee">
              {isGpu ? <>
                <Row label="GPU" value={fmt(resources.gpu_percent)} unit="%" accent="#b57bee" />
                <MiniBar value={resources.gpu_percent} max={100} color="#b57bee" />
                <div style={{ marginTop: "0.55rem" }}>
                  <Row label="VRAM" value={fmt(resources.vram_mb, 0)} unit="MB" />
                  <MiniBar value={resources.vram_mb} max={resources.vram_limit_mb} color="#b57bee" />
                </div>
              </> : <>
                <Row label="CPU" value={fmt(resources.cpu_percent)} unit="%" accent="#b57bee" />
                <MiniBar value={resources.cpu_percent} max={100} color="#b57bee" />
              </>}
              <div style={{ marginTop: "0.55rem" }}>
                <Row label="RAM" value={fmt(resources.mem_mb, 0)} unit="MB" />
                <MiniBar value={resources.mem_mb} max={resources.mem_limit_mb} color="#b57bee" />
              </div>
              <div style={{ marginTop: "0.45rem" }}>
                <Sparkline history={isGpu ? history.gpu : history.cpu} color="#b57bee" height={26} />
              </div>
            </Card>

            {/* Cost */}
            <Card title="Cost Signal" category="Runtime Cost" accent="#f5a623">
              <Row label={isGpu ? "GPU Util" : "CPU Util"} value={fmt(isGpu ? cost.gpu_pct : cost.cpu_pct)} unit="%" accent="#f5a623" />
              <Row label="Est $/1k tokens" value={`$${cost.cost_per_1k_tokens.toFixed(4)}`} accent="#00e8c6" />
              <Row label="Hourly est." value={`$${cost.hourly_est_usd.toFixed(3)}`} />
              <div style={{ marginTop: "0.45rem" }}>
                <MiniBar value={isGpu ? cost.gpu_pct : cost.cpu_pct} max={100} color="#f5a623" />
              </div>
              <div style={{ marginTop: "0.45rem" }}>
                <Sparkline history={isGpu ? history.gpu : history.cpu} color="#f5a623" height={26} />
              </div>
            </Card>

            {/* Stability */}
            <Card title="Stability" category="Error & Timeout" accent="var(--red)">
              <Row label="Error Rate"   value={fmt(stability.error_rate, 2)}   unit="%" accent={stability.error_rate > 1 ? "var(--red)" : "var(--green)"} />
              <Row label="Timeout Rate" value={fmt(stability.timeout_rate, 3)} unit="%" accent={stability.timeout_rate > 0.5 ? "var(--yellow)" : "var(--green)"} />
              <div style={{ marginTop: "0.65rem", paddingTop: "0.65rem", borderTop: "1px solid var(--border)" }}>
                <Row label="Uptime" value={fmtUptime(stability.uptime_sec)} accent="var(--green)" />
              </div>
              <div style={{ marginTop: "0.45rem", display: "flex", gap: "0.45rem" }}>
                {[0.5, 1, 2, 3, 4].map((t, i) => (
                  <div key={i} style={{ flex: 1, height: 21, borderRadius: 3, background: stability.error_rate < t ? "rgba(57,217,138,0.1)" : "rgba(255,77,106,0.1)", border: `1px solid ${stability.error_rate < t ? "rgba(57,217,138,0.2)" : "rgba(255,77,106,0.2)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.5rem", fontFamily: "var(--mono)", color: "var(--text2)" }}>
                    {t}%
                  </div>
                ))}
              </div>
            </Card>

            {/* Operability */}
            <Card title="Operability" category="Runtime Health" accent="var(--orange)">
              <Row label="Startup Time" value={fmt(operability.startup_ms, 0)} unit="ms" accent="var(--orange)" />
              <Row label="Last Restart" value={operability.last_restart} />
              <Row label="Log Rate"     value={fmt(operability.log_lines_per_min, 0)} unit="lines/min" />
              <div style={{ marginTop: "0.5rem" }}>
                <Row label="Context" value={fmt(operability.ctx_used, 0)} unit={`/ ${operability.ctx_limit.toLocaleString()}`} />
                <MiniBar value={operability.ctx_used} max={operability.ctx_limit} color="var(--orange)" />
              </div>
              <div style={{ marginTop: "0.55rem", paddingTop: "0.55rem", borderTop: "1px solid var(--border)" }}>
                <div style={{ fontSize: "0.58rem", color: "var(--text2)", marginBottom: "0.35rem", fontFamily: "var(--mono)", letterSpacing: "0.06em" }}>HEALTH CHECKS</div>
                {Object.entries(health.checks).map(([k, v]) => <Dot key={k} ok={v} label={k.toUpperCase()} />)}
              </div>
            </Card>

            {/* Network / API */}
            <Card title="API Reliability" category="Network" accent="var(--teal)">
              <Row label="Success Rate" value={fmt(network.success_rate, 2)} unit="%" accent={network.success_rate > 99 ? "var(--green)" : "var(--yellow)"} />
              <Row label="Avg Latency"  value={fmt(network.avg_latency_ms)} unit="ms" accent="var(--teal)" />
              <Row label="Timeouts"     value={network.timeout_count} accent={network.timeout_count > 0 ? "var(--yellow)" : "var(--green)"} />
              <div style={{ marginTop: "0.65rem" }}>
                <div style={{ height: 6, borderRadius: 3, overflow: "hidden", background: "var(--border)" }}>
                  <div style={{ width: `${clamp(network.success_rate, 0, 100)}%`, height: "100%", background: "linear-gradient(90deg, var(--teal), var(--green))", borderRadius: 3, transition: "width 0.6s ease", boxShadow: "0 0 8px var(--teal)" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.22rem" }}>
                  <span style={{ fontSize: "0.52rem", color: "var(--text2)", fontFamily: "var(--mono)" }}>0%</span>
                  <span style={{ fontSize: "0.52rem", color: "var(--text2)", fontFamily: "var(--mono)" }}>SLA: 99.0%</span>
                  <span style={{ fontSize: "0.52rem", color: "var(--text2)", fontFamily: "var(--mono)" }}>100%</span>
                </div>
              </div>
              <div style={{ marginTop: "0.65rem", paddingTop: "0.65rem", borderTop: "1px solid var(--border)" }}>
                <Row label="Endpoint" value={bkDef.endpoint} dim />
              </div>
            </Card>

          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div style={{ paddingTop: "0.65rem", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: "0.54rem", color: "var(--text2)", letterSpacing: "0.06em" }}>
            LLM INFERENCE MONITOR · {bkDef.label.toUpperCase()} · AUTO-REFRESH 5s · MOCK DATA — replace mockSnapshot() with real fetch
          </span>
          <span style={{ fontFamily: "var(--mono)", fontSize: "0.54rem", color: "var(--text2)" }}>
            {new Date(snap.timestamp).toLocaleTimeString()}
          </span>
        </div>

      </div>
    </>
  );
}
