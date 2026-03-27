import { useState, useEffect, useRef } from "react";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=Barlow:wght@400;500;600;700;800&display=swap');`;

// ── Mock data generator (replace with fetch('/api/snapshot')) ──────────────
function mockSnapshot(prev) {
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
      uptime_sec: (prev?.stability?.uptime_sec ?? 86400) + 5,
    },
    operability: {
      startup_ms: 2340,
      last_restart: "2h 14m ago",
      log_lines_per_min: jitter(42, 0.2),
    },
    security: {
      namespace: "llm-prod",
      egress: "zos-only",
      service_account: "llm-infer-sa",
      token_age_sec: jitter(412, 0.02),
      token_limit_sec: 600,
    },
    integration: {
      zos_rest: {
        success_rate: jitter(99.2, 0.005),
        avg_latency_ms: jitter(18, 0.15),
        timeout_count: Math.floor(jitter(1, 1)),
      },
    },
    health: {
      status: "healthy",
      checks: { inference: true, zos: true, iam: true, memory: true },
    },
  };
}

function fmt(n, dec = 1) { return typeof n === "number" ? n.toFixed(dec) : "—"; }
function fmtUptime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}
function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }

function Sparkline({ history, color = "var(--accent)", height = 36 }) {
  if (!history || history.length < 2) return null;
  const w = 120, h = height;
  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min || 1;
  const pts = history.map((v, i) => {
    const x = (i / (history.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
      <polyline points={`0,${h} ${pts} ${w},${h}`}
        fill={color} opacity="0.08" stroke="none" />
    </svg>
  );
}

function MiniBar({ value, max, color = "var(--accent)" }) {
  const pct = clamp((value / max) * 100, 0, 100);
  const warn = pct > 80;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <div style={{ flex: 1, height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{
          width: `${pct}%`, height: "100%", borderRadius: 2,
          background: warn ? "var(--yellow)" : color,
          transition: "width 0.6s ease",
          boxShadow: warn ? "0 0 6px var(--yellow)" : `0 0 6px ${color}`,
        }} />
      </div>
      <span style={{ fontSize: "0.65rem", color: warn ? "var(--yellow)" : "var(--text2)", minWidth: "2.5rem", textAlign: "right" }}>
        {fmt(pct, 0)}%
      </span>
    </div>
  );
}

function Card({ title, category, accent = "var(--accent)", children, style }) {
  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: 8,
      overflow: "hidden",
      animation: "fadeUp 0.4s ease both",
      ...style,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: "0.5rem",
        padding: "0.6rem 0.9rem",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface2)",
      }}>
        <div style={{ width: 3, height: 14, borderRadius: 2, background: accent, boxShadow: `0 0 8px ${accent}` }} />
        <span style={{ fontSize: "0.6rem", fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text2)" }}>
          {category}
        </span>
        <span style={{ marginLeft: "auto", fontSize: "0.62rem", fontWeight: 700, color: accent, letterSpacing: "0.06em" }}>
          {title}
        </span>
      </div>
      <div style={{ padding: "0.85rem 0.9rem" }}>{children}</div>
    </div>
  );
}

function Row({ label, value, unit = "", accent, dim }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.45rem" }}>
      <span style={{ fontSize: "0.65rem", color: "var(--text2)", letterSpacing: "0.04em" }}>{label}</span>
      <span style={{ fontFamily: "var(--mono)", fontSize: "0.85rem", fontWeight: 600, color: dim ? "var(--text2)" : (accent || "var(--text)") }}>
        {value}<span style={{ fontSize: "0.65rem", color: "var(--text2)", marginLeft: "0.2rem" }}>{unit}</span>
      </span>
    </div>
  );
}

function Dot({ ok, label }) {
  const c = ok ? "var(--green)" : "var(--red)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.35rem" }}>
      <div style={{
        width: 7, height: 7, borderRadius: "50%", background: c,
        boxShadow: `0 0 6px ${c}`, flexShrink: 0,
        animation: ok ? "pulse 2s infinite" : "none",
      }} />
      <span style={{ fontSize: "0.68rem", color: "var(--text)", letterSpacing: "0.03em" }}>{label}</span>
      <span style={{ marginLeft: "auto", fontSize: "0.6rem", fontWeight: 600, color: c }}>
        {ok ? "OK" : "FAIL"}
      </span>
    </div>
  );
}

function TokenArc({ age, limit }) {
  const pct = clamp(age / limit, 0, 1);
  const r = 22, cx = 28, cy = 28;
  const circ = 2 * Math.PI * r;
  const dash = pct * circ;
  const warn = pct > 0.7;
  const color = warn ? "var(--yellow)" : "var(--green)";
  return (
    <svg width={56} height={56}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={4} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ filter: `drop-shadow(0 0 4px ${color})`, transition: "stroke-dasharray 0.6s ease" }} />
      <text x={cx} y={cy + 4} textAnchor="middle" fill={color}
        style={{ fontSize: "9px", fontFamily: "var(--mono)", fontWeight: 600 }}>
        {fmt(age, 0)}s
      </text>
    </svg>
  );
}

export default function Dashboard() {
  const [snap, setSnap] = useState(null);
  const [history, setHistory] = useState({ avg: [], p95: [], p99: [], rps: [], cpu: [], mips: [] });
  const [tick, setTick] = useState(0);
  const prevRef = useRef(null);

  useEffect(() => {
    const update = () => {
      // To connect to real backend, replace mockSnapshot() with:
      // const s = await fetch('/api/snapshot').then(r => r.json())
      const s = mockSnapshot(prevRef.current);
      prevRef.current = s;
      setSnap(s);
      setHistory(h => ({
        avg:  [...h.avg.slice(-29),  s.inference.avg_ms],
        p95:  [...h.p95.slice(-29),  s.inference.p95_ms],
        p99:  [...h.p99.slice(-29),  s.inference.p99_ms],
        rps:  [...h.rps.slice(-29),  s.inference.throughput_rps],
        cpu:  [...h.cpu.slice(-29),  s.resources.cpu_percent],
        mips: [...h.mips.slice(-29), s.cost.mips],
      }));
      setTick(t => t + 1);
    };
    update();
    const id = setInterval(update, 5000);
    return () => clearInterval(id);
  }, []);

  if (!snap) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#080b0f", color: "#4a6278", fontFamily: "IBM Plex Mono, monospace", fontSize: "0.8rem", letterSpacing: "0.1em" }}>
      INITIALIZING...
    </div>
  );

  const { inference, resources, cost, stability, operability, security, integration, health } = snap;
  const allHealthy = Object.values(health.checks).every(Boolean);

  return (
    <>
      <style>{`
        ${FONTS}
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg: #080b0f;
          --surface: #0d1117;
          --surface2: #111820;
          --border: #1a2535;
          --accent: #00c8ff;
          --green: #39d98a;
          --yellow: #f5a623;
          --red: #ff4d6a;
          --purple: #b57bee;
          --orange: #ff7c43;
          --teal: #00e8c6;
          --text: #c9daea;
          --text2: #4a6278;
          --mono: 'IBM Plex Mono', monospace;
          --sans: 'Barlow', sans-serif;
        }
        body { background: var(--bg); color: var(--text); font-family: var(--sans); margin: 0; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: var(--bg); }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
      `}</style>

      <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "1.25rem" }}>

        {/* ── Header ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: "1.25rem", paddingBottom: "1rem",
          borderBottom: "1px solid var(--border)",
        }}>
          <div>
            <div style={{ fontSize: "0.6rem", fontFamily: "var(--mono)", letterSpacing: "0.18em", color: "var(--accent)", marginBottom: "0.25rem" }}>
              // LLM OBSERVABILITY PLATFORM
            </div>
            <div style={{ fontFamily: "var(--sans)", fontWeight: 800, fontSize: "1.5rem", letterSpacing: "-0.02em", color: "#e8f4ff" }}>
              INFERENCE <span style={{ color: "var(--accent)" }}>MONITOR</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: "0.62rem", color: "var(--text2)", textAlign: "right" }}>
              <div style={{ marginBottom: "0.15rem" }}>NAMESPACE <span style={{ color: "var(--text)" }}>{security.namespace}</span></div>
              <div>POLL <span style={{ color: "var(--accent)" }}>5s</span> · TICK <span style={{ color: "var(--accent)" }}>#{tick}</span></div>
            </div>
            <div style={{
              display: "flex", alignItems: "center", gap: "0.5rem",
              background: allHealthy ? "rgba(57,217,138,0.08)" : "rgba(255,77,106,0.08)",
              border: `1px solid ${allHealthy ? "rgba(57,217,138,0.25)" : "rgba(255,77,106,0.25)"}`,
              borderRadius: 6, padding: "0.4rem 0.8rem",
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: allHealthy ? "var(--green)" : "var(--red)",
                boxShadow: `0 0 8px ${allHealthy ? "var(--green)" : "var(--red)"}`,
                animation: "pulse 2s infinite",
              }} />
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.65rem", fontWeight: 600, color: allHealthy ? "var(--green)" : "var(--red)", letterSpacing: "0.1em" }}>
                {allHealthy ? "HEALTHY" : "DEGRADED"}
              </span>
            </div>
          </div>
        </div>

        {/* ── 8-card Grid ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "0.9rem" }}>

          {/* 1 · Performance */}
          <Card title="Latency" category="Performance" accent="var(--accent)">
            <Row label="Average" value={fmt(inference.avg_ms)} unit="ms" accent="var(--accent)" />
            <Row label="P95"     value={fmt(inference.p95_ms)} unit="ms" />
            <Row label="P99"     value={fmt(inference.p99_ms)} unit="ms" />
            <div style={{ marginTop: "0.6rem" }}>
              <Sparkline history={history.avg} color="var(--accent)" />
            </div>
            <div style={{ fontSize: "0.58rem", color: "var(--text2)", marginTop: "0.3rem", fontFamily: "var(--mono)" }}>
              30-point avg_ms trace
            </div>
          </Card>

          {/* 2 · Throughput */}
          <Card title="Throughput" category="Throughput" accent="var(--teal)">
            <div style={{ display: "flex", alignItems: "flex-end", gap: "0.4rem", marginBottom: "0.5rem" }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: "2rem", fontWeight: 600, color: "var(--teal)", lineHeight: 1 }}>
                {fmt(inference.throughput_rps)}
              </span>
              <span style={{ fontSize: "0.7rem", color: "var(--text2)", marginBottom: "0.3rem" }}>req/s</span>
            </div>
            <Sparkline history={history.rps} color="var(--teal)" />
            <div style={{ marginTop: "0.6rem" }}>
              <Row label="Error rate" value={fmt(inference.errors_perc, 2)} unit="%"
                accent={inference.errors_perc > 1 ? "var(--red)" : "var(--green)"} />
            </div>
          </Card>

          {/* 3 · Resource Use */}
          <Card title="Resource Use" category="Resources" accent="var(--purple)">
            <Row label="CPU" value={fmt(resources.cpu_percent)} unit="%" accent="var(--purple)" />
            <MiniBar value={resources.cpu_percent} max={100} color="var(--purple)" />
            <div style={{ marginTop: "0.75rem" }}>
              <Row label="Memory" value={fmt(resources.mem_mb, 0)} unit="MB" />
              <MiniBar value={resources.mem_mb} max={resources.mem_limit_mb} color="var(--purple)" />
            </div>
            <div style={{ marginTop: "0.6rem" }}>
              <Sparkline history={history.cpu} color="var(--purple)" height={28} />
            </div>
          </Card>

          {/* 4 · Cost Signal */}
          <Card title="Cost Signal" category="z/OS Cost" accent="var(--yellow)">
            <Row label="Current MIPS"   value={fmt(cost.mips, 0)}               accent="var(--yellow)" />
            <Row label="4hr Avg MIPS"   value={fmt(cost.four_hour_avg_mips, 0)} dim />
            <Row label="zIIP Offload"   value={fmt(cost.ziip_percent)}  unit="%" accent="var(--teal)" />
            <div style={{ marginTop: "0.5rem" }}>
              <MiniBar value={cost.ziip_percent} max={100} color="var(--teal)" />
            </div>
            <div style={{ marginTop: "0.5rem" }}>
              <Sparkline history={history.mips} color="var(--yellow)" height={28} />
            </div>
          </Card>

          {/* 5 · Stability */}
          <Card title="Stability" category="Error & Timeout" accent="var(--red)">
            <Row label="Error Rate"   value={fmt(stability.error_rate, 2)}   unit="%"
              accent={stability.error_rate > 1 ? "var(--red)" : "var(--green)"} />
            <Row label="Timeout Rate" value={fmt(stability.timeout_rate, 3)} unit="%"
              accent={stability.timeout_rate > 0.5 ? "var(--yellow)" : "var(--green)"} />
            <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)" }}>
              <Row label="Uptime" value={fmtUptime(stability.uptime_sec)} accent="var(--green)" />
            </div>
            <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem" }}>
              {[0.5, 1, 2, 3, 4].map((thresh, i) => (
                <div key={i} style={{
                  flex: 1, height: 24, borderRadius: 3,
                  background: stability.error_rate < thresh ? "rgba(57,217,138,0.1)" : "rgba(255,77,106,0.1)",
                  border: `1px solid ${stability.error_rate < thresh ? "rgba(57,217,138,0.2)" : "rgba(255,77,106,0.2)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "0.55rem", fontFamily: "var(--mono)", color: "var(--text2)",
                }}>
                  {thresh}%
                </div>
              ))}
            </div>
          </Card>

          {/* 6 · Operability */}
          <Card title="Operability" category="Runtime Health" accent="var(--orange)">
            <Row label="Startup Time" value={fmt(operability.startup_ms, 0)} unit="ms" accent="var(--orange)" />
            <Row label="Last Restart" value={operability.last_restart} />
            <Row label="Log Rate"     value={fmt(operability.log_lines_per_min, 0)} unit="lines/min" />
            <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)" }}>
              <div style={{ fontSize: "0.62rem", color: "var(--text2)", marginBottom: "0.4rem", fontFamily: "var(--mono)", letterSpacing: "0.06em" }}>
                HEALTH CHECKS
              </div>
              {Object.entries(health.checks).map(([k, v]) => (
                <Dot key={k} ok={v} label={k.toUpperCase()} />
              ))}
            </div>
          </Card>

          {/* 7 · Security */}
          <Card title="Security" category="IAM & Network" accent="var(--green)">
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div style={{ flex: 1 }}>
                <Row label="Namespace"       value={security.namespace} />
                <Row label="Egress Policy"   value={security.egress}          accent="var(--green)" />
                <Row label="Service Account" value={security.service_account} />
              </div>
              <div style={{ marginLeft: "0.75rem" }}>
                <TokenArc age={security.token_age_sec} limit={security.token_limit_sec} />
                <div style={{ fontSize: "0.55rem", color: "var(--text2)", textAlign: "center", marginTop: "0.2rem", fontFamily: "var(--mono)" }}>
                  TOKEN AGE
                </div>
              </div>
            </div>
            <div style={{ marginTop: "0.6rem", paddingTop: "0.6rem", borderTop: "1px solid var(--border)" }}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: "0.35rem",
                background: "rgba(57,217,138,0.08)", border: "1px solid rgba(57,217,138,0.2)",
                borderRadius: 4, padding: "0.25rem 0.6rem",
                fontSize: "0.62rem", fontFamily: "var(--mono)", color: "var(--green)",
              }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--green)", animation: "pulse 2s infinite" }} />
                NETWORK ISOLATED
              </div>
            </div>
          </Card>

          {/* 8 · Integration */}
          <Card title="z/OS Integration" category="REST Reliability" accent="var(--teal)">
            <Row label="Success Rate" value={fmt(integration.zos_rest.success_rate, 2)} unit="%"
              accent={integration.zos_rest.success_rate > 99 ? "var(--green)" : "var(--yellow)"} />
            <Row label="Avg Latency"  value={fmt(integration.zos_rest.avg_latency_ms)} unit="ms" accent="var(--teal)" />
            <Row label="Timeouts"     value={integration.zos_rest.timeout_count}
              accent={integration.zos_rest.timeout_count > 0 ? "var(--yellow)" : "var(--green)"} />
            <div style={{ marginTop: "0.75rem" }}>
              <div style={{ height: 6, borderRadius: 3, overflow: "hidden", background: "var(--border)" }}>
                <div style={{
                  width: `${clamp(integration.zos_rest.success_rate, 0, 100)}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, var(--teal), var(--green))",
                  borderRadius: 3,
                  transition: "width 0.6s ease",
                  boxShadow: "0 0 8px var(--teal)",
                }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.25rem" }}>
                <span style={{ fontSize: "0.55rem", color: "var(--text2)", fontFamily: "var(--mono)" }}>0%</span>
                <span style={{ fontSize: "0.55rem", color: "var(--text2)", fontFamily: "var(--mono)" }}>SLA: 99.0%</span>
                <span style={{ fontSize: "0.55rem", color: "var(--text2)", fontFamily: "var(--mono)" }}>100%</span>
              </div>
            </div>
          </Card>

        </div>

        {/* ── Footer ── */}
        <div style={{
          marginTop: "1rem", paddingTop: "0.75rem",
          borderTop: "1px solid var(--border)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: "0.58rem", color: "var(--text2)", letterSpacing: "0.06em" }}>
            LLM INFERENCE MONITOR · AUTO-REFRESH 5s · MOCK DATA ACTIVE — swap mockSnapshot() for fetch('/api/snapshot')
          </span>
          <span style={{ fontFamily: "var(--mono)", fontSize: "0.58rem", color: "var(--text2)" }}>
            {new Date(snap.timestamp).toLocaleTimeString()}
          </span>
        </div>

      </div>
    </>
  );
}
