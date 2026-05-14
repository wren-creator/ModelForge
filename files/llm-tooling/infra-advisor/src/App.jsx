import { useState, useEffect, useRef, useCallback } from "react";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=Barlow:wght@400;500;600;700;800&display=swap');`;

const API = "/api";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n, dec = 1) { return typeof n === "number" ? n.toFixed(dec) : "—"; }
function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }
function uuid() { return Math.random().toString(36).slice(2, 10); }

const CATEGORY_LABELS = {
  "cloud-gpu":  "Cloud GPU",
  "on-prem":    "On-Prem",
  "consumer":   "Consumer",
  "cpu-only":   "CPU Only",
  "kubernetes": "Kubernetes",
  "edge":       "Edge",
};

const CATEGORY_COLORS = {
  "cloud-gpu":  { bg: "rgba(0,200,255,0.08)", border: "rgba(0,200,255,0.25)", accent: "#00c8ff" },
  "on-prem":    { bg: "rgba(181,123,238,0.08)", border: "rgba(181,123,238,0.25)", accent: "#b57bee" },
  "consumer":   { bg: "rgba(57,217,138,0.08)", border: "rgba(57,217,138,0.25)", accent: "#39d98a" },
  "cpu-only":   { bg: "rgba(245,166,35,0.08)", border: "rgba(245,166,35,0.25)", accent: "#f5a623" },
  "kubernetes": { bg: "rgba(0,232,198,0.08)", border: "rgba(0,232,198,0.25)", accent: "#00e8c6" },
  "edge":       { bg: "rgba(255,124,67,0.08)", border: "rgba(255,124,67,0.25)", accent: "#ff7c43" },
};

const PROVIDER_BADGE = {
  aws: { label: "AWS", bg: "rgba(255,153,0,0.12)", color: "#ff9900" },
  gcp: { label: "GCP", bg: "rgba(66,133,244,0.12)", color: "#4285f4" },
  azure: { label: "Azure", bg: "rgba(0,114,198,0.12)", color: "#0072c6" },
  nvidia: { label: "NVIDIA", bg: "rgba(118,185,0,0.12)", color: "#76b900" },
  amd: { label: "AMD", bg: "rgba(237,28,36,0.12)", color: "#ed1c24" },
  intel: { label: "Intel", bg: "rgba(0,113,197,0.12)", color: "#0071c5" },
  generic: { label: "Generic", bg: "rgba(100,116,139,0.12)", color: "#94a3b8" },
};

// ── Sub-components ────────────────────────────────────────────────────────────
function ScoreRing({ value, color, label, size = 52 }) {
  const r = (size / 2) - 5;
  const circ = 2 * Math.PI * r;
  const dash = clamp(value / 100, 0, 1) * circ;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border)" strokeWidth={4} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={4}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: "stroke-dasharray 0.5s ease" }} />
        <text x={size/2} y={size/2 + 4} textAnchor="middle" fill={color}
          style={{ fontSize: "10px", fontFamily: "var(--mono)", fontWeight: 600 }}>
          {value}
        </text>
      </svg>
      <span style={{ fontSize: "0.55rem", color: "var(--text2)", fontFamily: "var(--mono)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
    </div>
  );
}

function MiniBar({ value, max, color }) {
  const pct = clamp((value / max) * 100, 0, 100);
  const warn = pct > 80;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <div style={{ flex: 1, height: 3, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: warn ? "var(--yellow)" : color, borderRadius: 2, transition: "width 0.5s ease" }} />
      </div>
      <span style={{ fontSize: "0.6rem", color: warn ? "var(--yellow)" : "var(--text2)", minWidth: "2.2rem", textAlign: "right", fontFamily: "var(--mono)" }}>
        {fmt(pct, 0)}%
      </span>
    </div>
  );
}

function StatusDot({ ok }) {
  return (
    <div style={{
      width: 7, height: 7, borderRadius: "50%",
      background: ok ? "var(--green)" : "var(--red)",
      boxShadow: `0 0 6px ${ok ? "var(--green)" : "var(--red)"}`,
      animation: "pulse 2s infinite",
      flexShrink: 0,
    }} />
  );
}

function Card({ title, category, accent = "var(--accent)", children, style }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.6rem 0.9rem", borderBottom: "1px solid var(--border)", background: "var(--surface2)" }}>
        <div style={{ width: 3, height: 14, borderRadius: 2, background: accent }} />
        <span style={{ fontSize: "0.6rem", fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text2)" }}>{category}</span>
        <span style={{ marginLeft: "auto", fontSize: "0.62rem", fontWeight: 700, color: accent, letterSpacing: "0.06em" }}>{title}</span>
      </div>
      <div style={{ padding: "0.85rem 0.9rem" }}>{children}</div>
    </div>
  );
}

function Row({ label, value, unit = "", accent }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.4rem" }}>
      <span style={{ fontSize: "0.65rem", color: "var(--text2)" }}>{label}</span>
      <span style={{ fontFamily: "var(--mono)", fontSize: "0.82rem", fontWeight: 600, color: accent || "var(--text)" }}>
        {value}<span style={{ fontSize: "0.6rem", color: "var(--text2)", marginLeft: "0.2rem" }}>{unit}</span>
      </span>
    </div>
  );
}

function WeightSlider({ label, id, value, onChange, color }) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
        <span style={{ fontSize: "0.68rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text2)" }}>{label}</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: "0.9rem", fontWeight: 600, color }}>{value}</span>
      </div>
      <input
        type="range" min={0} max={100} step={1} value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        style={{ width: "100%", accentColor: color, cursor: "pointer" }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.2rem" }}>
        <span style={{ fontSize: "0.55rem", color: "var(--text2)", fontFamily: "var(--mono)" }}>Not important</span>
        <span style={{ fontSize: "0.55rem", color: "var(--text2)", fontFamily: "var(--mono)" }}>Critical</span>
      </div>
    </div>
  );
}

function CategoryFilter({ categories, active, onChange }) {
  return (
    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "1rem" }}>
      <button
        onClick={() => onChange(null)}
        style={{
          fontFamily: "var(--mono)", fontSize: "0.6rem", fontWeight: 600,
          letterSpacing: "0.08em", textTransform: "uppercase",
          padding: "0.3rem 0.7rem", borderRadius: 4, border: "1px solid",
          cursor: "pointer",
          background: active === null ? "var(--accent)" : "transparent",
          color: active === null ? "#000" : "var(--text2)",
          borderColor: active === null ? "var(--accent)" : "var(--border)",
          transition: "all 0.15s",
        }}>
        All
      </button>
      {categories.map(cat => {
        const colors = CATEGORY_COLORS[cat] || CATEGORY_COLORS["cloud-gpu"];
        const isActive = active === cat;
        return (
          <button key={cat}
            onClick={() => onChange(isActive ? null : cat)}
            style={{
              fontFamily: "var(--mono)", fontSize: "0.6rem", fontWeight: 600,
              letterSpacing: "0.08em", textTransform: "uppercase",
              padding: "0.3rem 0.7rem", borderRadius: 4, border: "1px solid",
              cursor: "pointer",
              background: isActive ? colors.accent : "transparent",
              color: isActive ? "#000" : colors.accent,
              borderColor: isActive ? colors.accent : colors.border,
              transition: "all 0.15s",
            }}>
            {CATEGORY_LABELS[cat] || cat}
          </button>
        );
      })}
    </div>
  );
}

function RecommendationCard({ profile, rank, selected, onSelect }) {
  const catColors = CATEGORY_COLORS[profile.category] || CATEGORY_COLORS["cloud-gpu"];
  const provBadge = PROVIDER_BADGE[profile.provider] || PROVIDER_BADGE.generic;
  const scores = profile.scores || { costScore: 0, respScore: 0, accScore: 0, composite: 0 };
  const isSelected = selected === profile.id;

  return (
    <div
      onClick={() => onSelect(profile.id)}
      style={{
        background: "var(--surface)",
        border: isSelected ? `2px solid ${catColors.accent}` : "1px solid var(--border)",
        borderRadius: 8, padding: "1rem", marginBottom: "0.75rem",
        cursor: "pointer", transition: "border-color 0.2s, background 0.2s",
        background: isSelected ? catColors.bg : "var(--surface)",
        position: "relative",
        overflow: "hidden",
      }}>

      {/* Rank badge */}
      {rank === 0 && (
        <div style={{
          position: "absolute", top: 0, right: 0,
          background: catColors.accent, color: "#000",
          fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.12em",
          padding: "0.2rem 0.6rem", borderBottomLeftRadius: 6, fontFamily: "var(--mono)",
        }}>
          BEST MATCH
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "0.75rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.75rem", fontWeight: 700, color: catColors.accent, letterSpacing: "0.06em" }}>
              #{rank + 1}
            </span>
            <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.01em" }}>
              {profile.name}
            </span>
          </div>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            <span style={{
              fontSize: "0.58rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase",
              padding: "0.2rem 0.5rem", borderRadius: 3,
              background: catColors.bg, color: catColors.accent, border: `1px solid ${catColors.border}`,
              fontFamily: "var(--mono)",
            }}>
              {CATEGORY_LABELS[profile.category] || profile.category}
            </span>
            {profile.provider && (
              <span style={{
                fontSize: "0.58rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase",
                padding: "0.2rem 0.5rem", borderRadius: 3, fontFamily: "var(--mono)",
                background: provBadge.bg, color: provBadge.color,
              }}>
                {provBadge.label}
              </span>
            )}
            <span style={{
              fontSize: "0.58rem", fontFamily: "var(--mono)", fontWeight: 600,
              padding: "0.2rem 0.5rem", borderRadius: 3,
              background: "rgba(100,116,139,0.1)", color: "var(--text2)",
            }}>
              {profile.cost_model.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Composite score */}
        <div style={{ textAlign: "center", minWidth: 52, flexShrink: 0 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: "1.6rem", fontWeight: 700, color: catColors.accent, lineHeight: 1 }}>
            {scores.composite}
          </div>
          <div style={{ fontSize: "0.55rem", color: "var(--text2)", fontFamily: "var(--mono)", letterSpacing: "0.08em", marginTop: 2 }}>
            SCORE
          </div>
        </div>
      </div>

      {/* Specs grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem", marginBottom: "0.75rem" }}>
        {[
          { label: "GPU", value: profile.gpu_model ? `${profile.gpu_count}× ${profile.gpu_model.split(" ×")[0].split(" × ")[0]}` : "CPU only" },
          { label: "VRAM", value: profile.vram_gb > 0 ? `${profile.vram_gb}GB` : "N/A" },
          { label: "Cost/hr", value: profile.cost_per_hour === 0 ? "Owned" : `$${profile.cost_per_hour.toFixed(3)}` },
          { label: "P95 est.", value: `${profile.typical_p95_ms >= 1000 ? (profile.typical_p95_ms/1000).toFixed(1)+"s" : profile.typical_p95_ms+"ms"}` },
          { label: "Max TPS", value: `${profile.max_throughput_tps}` },
          { label: "Max params", value: `${profile.max_model_params_b}B` },
        ].map(s => (
          <div key={s.label} style={{ background: "var(--surface2)", borderRadius: 4, padding: "0.4rem 0.5rem" }}>
            <div style={{ fontSize: "0.55rem", color: "var(--text2)", fontFamily: "var(--mono)", letterSpacing: "0.06em", marginBottom: 2 }}>{s.label}</div>
            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text)", fontFamily: "var(--mono)" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Score rings */}
      <div style={{ display: "flex", gap: "1rem", justifyContent: "center", marginBottom: "0.75rem" }}>
        <ScoreRing value={scores.costScore} color="var(--green)" label="Cost" size={48} />
        <ScoreRing value={scores.respScore} color="var(--accent)" label="Resp" size={48} />
        <ScoreRing value={scores.accScore} color="var(--purple)" label="Accuracy" size={48} />
      </div>

      {/* Precision support */}
      <div style={{ display: "flex", gap: "0.35rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
        {[
          { label: "FP8", ok: profile.supports_fp8 },
          { label: "BF16", ok: profile.supports_bf16 },
          { label: "FP16", ok: profile.supports_fp16 },
          { label: "INT8", ok: profile.supports_int8 },
          { label: "INT4", ok: profile.supports_int4 },
        ].map(p => (
          <span key={p.label} style={{
            fontFamily: "var(--mono)", fontSize: "0.58rem", fontWeight: 600,
            padding: "0.2rem 0.4rem", borderRadius: 3,
            background: p.ok ? "rgba(57,217,138,0.08)" : "rgba(255,77,106,0.06)",
            color: p.ok ? "var(--green)" : "rgba(255,77,106,0.4)",
            border: `1px solid ${p.ok ? "rgba(57,217,138,0.2)" : "rgba(255,77,106,0.12)"}`,
            textDecoration: p.ok ? "none" : "line-through",
          }}>
            {p.label}
          </span>
        ))}
      </div>

      {/* Insights */}
      {profile.insights && profile.insights.length > 0 && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.6rem" }}>
          {profile.insights.map((insight, i) => (
            <div key={i} style={{ display: "flex", gap: "0.4rem", marginBottom: "0.3rem" }}>
              <span style={{ color: catColors.accent, fontSize: "0.65rem", flexShrink: 0, marginTop: 1 }}>›</span>
              <span style={{ fontSize: "0.65rem", color: "var(--text2)", lineHeight: 1.5 }}>{insight}</span>
            </div>
          ))}
        </div>
      )}

      {/* Notes */}
      {profile.notes && (
        <div style={{ marginTop: "0.5rem", fontSize: "0.62rem", color: "var(--text2)", fontStyle: "italic", lineHeight: 1.5, borderTop: "1px solid var(--border)", paddingTop: "0.5rem" }}>
          {profile.notes}
        </div>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [costWeight, setCostWeight] = useState(33);
  const [respWeight, setRespWeight] = useState(34);
  const [accWeight, setAccWeight]   = useState(33);

  const [recommendations, setRecommendations] = useState([]);
  const [inferenceSnap, setInferenceSnap] = useState(null);
  const [modelConfig, setModelConfig]     = useState(null);
  const [categories, setCategories]       = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [selectedId, setSelectedId]       = useState(null);
  const [loading, setLoading]             = useState(false);
  const [health, setHealth]               = useState(null);
  const [tick, setTick]                   = useState(0);
  const [lastScored, setLastScored]       = useState(null);

  const sessionId = useRef(uuid());
  const debounceRef = useRef(null);

  // ── Fetch health ──
  useEffect(() => {
    fetch(`${API}/health`)
      .then(r => r.json())
      .then(setHealth)
      .catch(() => {});
  }, []);

  // ── Fetch categories ──
  useEffect(() => {
    fetch(`${API}/hardware/categories`)
      .then(r => r.json())
      .then(setCategories)
      .catch(() => {});
  }, []);

  // ── Fetch latest ModelForge config ──
  useEffect(() => {
    fetch(`${API}/modelforge/config/latest`)
      .then(r => r.json())
      .then(cfg => { if (cfg) setModelConfig(cfg); })
      .catch(() => {});
  }, []);

  // ── Fetch inference snapshot every 5s ──
  useEffect(() => {
    const poll = () => {
      fetch(`${API}/inference/snapshot`)
        .then(r => r.json())
        .then(snap => { setInferenceSnap(snap); setTick(t => t + 1); })
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  // ── Fetch recommendations (debounced on weight change) ──
  const fetchRecommendations = useCallback(() => {
    setLoading(true);
    fetch(`${API}/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        costWeight, respWeight, accWeight,
        modelConfig,
        sessionId: sessionId.current,
      }),
    })
      .then(r => r.json())
      .then(data => {
        setRecommendations(data.recommendations || []);
        setLastScored(data.scoredAt);
        if (!selectedId && data.recommendations?.length > 0) {
          setSelectedId(data.recommendations[0].id);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [costWeight, respWeight, accWeight, modelConfig]);

  // Debounce slider changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchRecommendations, 350);
    return () => clearTimeout(debounceRef.current);
  }, [fetchRecommendations]);

  // ── Filtered list ──
  const displayed = activeCategory
    ? recommendations.filter(r => r.category === activeCategory)
    : recommendations;

  const allHealthy = health?.inferenceMonitorConnected;
  const isMock = inferenceSnap?._mock;
  const inf = inferenceSnap?.inference;
  const res = inferenceSnap?.resources;

  // ── Normalised weight bars ──
  const totalW = costWeight + respWeight + accWeight || 1;
  const costPct = Math.round((costWeight / totalW) * 100);
  const respPct = Math.round((respWeight / totalW) * 100);
  const accPct  = Math.round((accWeight  / totalW) * 100);

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
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin { to { transform: rotate(360deg); } }
        input[type=range] { -webkit-appearance: auto; height: 4px; border-radius: 2px; cursor: pointer; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: var(--bg); }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
      `}</style>

      <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "1.25rem" }}>

        {/* ── Header ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: "1.25rem", paddingBottom: "1rem", borderBottom: "1px solid var(--border)",
        }}>
          <div>
            <div style={{ fontSize: "0.6rem", fontFamily: "var(--mono)", letterSpacing: "0.18em", color: "var(--accent)", marginBottom: "0.25rem" }}>
              // LLM TOOLING SUITE · COMPONENT 3 by: Britley Hoff
            </div>
            <div style={{ fontFamily: "var(--sans)", fontWeight: 800, fontSize: "1.5rem", letterSpacing: "-0.02em", color: "#e8f4ff" }}>
              INFRASTRUCTURE <span style={{ color: "var(--accent)" }}>ADVISOR</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: "0.6rem", color: "var(--text2)", textAlign: "right" }}>
              <div style={{ marginBottom: "0.15rem" }}>
                INFERENCE {" "}
                <span style={{ color: isMock ? "var(--yellow)" : "var(--green)" }}>
                  {isMock ? "MOCK" : "LIVE"}
                </span>
              </div>
              <div>POLL <span style={{ color: "var(--accent)" }}>5s</span> · TICK <span style={{ color: "var(--accent)" }}>#{tick}</span></div>
            </div>
            <div style={{
              display: "flex", alignItems: "center", gap: "0.5rem",
              background: health?.dbProfiles ? "rgba(57,217,138,0.08)" : "rgba(255,166,35,0.08)",
              border: `1px solid ${health?.dbProfiles ? "rgba(57,217,138,0.25)" : "rgba(255,166,35,0.25)"}`,
              borderRadius: 6, padding: "0.4rem 0.8rem",
            }}>
              <StatusDot ok={!!health?.dbProfiles} />
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.65rem", fontWeight: 600,
                color: health?.dbProfiles ? "var(--green)" : "var(--yellow)", letterSpacing: "0.1em" }}>
                {health?.dbProfiles ? `${health.dbProfiles} PROFILES` : "LOADING"}
              </span>
            </div>
          </div>
        </div>

        {/* ── 3-column layout ── */}
        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr 300px", gap: "0.9rem", alignItems: "start" }}>

          {/* ── LEFT: Controls ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>

            {/* Priority sliders */}
            <Card title="Requirements" category="Priority Weights" accent="var(--accent)">
              <WeightSlider label="Cost efficiency" value={costWeight} onChange={setCostWeight} color="var(--green)" />
              <WeightSlider label="Responsiveness" value={respWeight} onChange={setRespWeight} color="var(--accent)" />
              <WeightSlider label="Accuracy"       value={accWeight}  onChange={setAccWeight}  color="var(--purple)" />

              {/* Normalised bars */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem", marginTop: "0.5rem" }}>
                <div style={{ fontSize: "0.58rem", color: "var(--text2)", fontFamily: "var(--mono)", letterSpacing: "0.1em", marginBottom: "0.5rem" }}>
                  NORMALISED WEIGHTS
                </div>
                {[
                  { label: "Cost", pct: costPct, color: "var(--green)" },
                  { label: "Resp", pct: respPct, color: "var(--accent)" },
                  { label: "Acc",  pct: accPct,  color: "var(--purple)" },
                ].map(w => (
                  <div key={w.label} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
                    <span style={{ fontSize: "0.6rem", color: "var(--text2)", fontFamily: "var(--mono)", width: "2.5rem" }}>{w.label}</span>
                    <div style={{ flex: 1, height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${w.pct}%`, height: "100%", background: w.color, borderRadius: 2, transition: "width 0.3s ease" }} />
                    </div>
                    <span style={{ fontSize: "0.6rem", color: w.color, fontFamily: "var(--mono)", minWidth: "2rem", textAlign: "right" }}>{w.pct}%</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* ModelForge signal */}
            <Card title="Model Config" category="From ModelForge" accent="var(--purple)">
              {modelConfig ? (
                <>
                  <Row label="Model"    value={modelConfig.model}        accent="var(--purple)" />
                  <Row label="Backend"  value={modelConfig.backend}      />
                  <Row label="Quant"    value={modelConfig.quantization} />
                  <Row label="Context"  value={`${(modelConfig.contextLength || 2048).toLocaleString()} tok`} />
                  <Row label="GPUs"     value={modelConfig.gpuCount}     />
                </>
              ) : (
                <div style={{ fontSize: "0.65rem", color: "var(--text2)", fontFamily: "var(--mono)" }}>
                  No ModelForge config received yet.{" "}
                  <span style={{ color: "var(--accent)" }}>POST /api/modelforge/config</span>
                </div>
              )}
            </Card>

            {/* Backend health */}
            <Card title="Backend" category="System Health" accent="var(--green)">
              {[
                { label: "Advisor API",      ok: !!health },
                { label: "Inference monitor", ok: !isMock },
                { label: "Hardware DB",       ok: (health?.dbProfiles ?? 0) > 0 },
                { label: "ModelForge config", ok: !!modelConfig },
              ].map(s => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.4rem" }}>
                  <StatusDot ok={s.ok} />
                  <span style={{ fontSize: "0.65rem", color: "var(--text)", flex: 1 }}>{s.label}</span>
                  <span style={{ fontSize: "0.58rem", fontWeight: 600, color: s.ok ? "var(--green)" : "var(--yellow)", fontFamily: "var(--mono)" }}>
                    {s.ok ? "OK" : "WAITING"}
                  </span>
                </div>
              ))}
            </Card>
          </div>

          {/* ── CENTRE: Recommendations ── */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.65rem", color: "var(--text2)", letterSpacing: "0.1em" }}>
                {loading
                  ? "SCORING..."
                  : `${displayed.length} OF ${recommendations.length} PROFILES · SCORED ${lastScored ? new Date(lastScored).toLocaleTimeString() : "—"}`}
              </span>
              {loading && (
                <div style={{ width: 14, height: 14, border: "2px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
              )}
            </div>

            <CategoryFilter categories={categories} active={activeCategory} onChange={setActiveCategory} />

            {displayed.length === 0 && !loading && (
              <div style={{ textAlign: "center", padding: "3rem", color: "var(--text2)", fontFamily: "var(--mono)", fontSize: "0.7rem" }}>
                {activeCategory ? `No profiles in category: ${activeCategory}` : "Awaiting recommendations..."}
              </div>
            )}

            <div style={{ animation: "fadeUp 0.3s ease" }}>
              {displayed.map((profile, i) => (
                <RecommendationCard
                  key={profile.id}
                  profile={profile}
                  rank={recommendations.indexOf(profile)}
                  selected={selectedId}
                  onSelect={setSelectedId}
                />
              ))}
            </div>
          </div>

          {/* ── RIGHT: Inference signals ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>

            <Card title="Live Signals" category="Inference Monitor" accent="var(--teal)">
              <Row label="Avg latency" value={fmt(inf?.avg_ms)} unit="ms" accent="var(--teal)" />
              <Row label="P95 latency" value={fmt(inf?.p95_ms)} unit="ms" />
              <Row label="P99 latency" value={fmt(inf?.p99_ms)} unit="ms" />
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.6rem", marginTop: "0.4rem" }}>
                <Row label="Throughput" value={fmt(inf?.throughput_rps)} unit="req/s" accent="var(--accent)" />
                <Row label="Error rate" value={fmt(inf?.errors_perc, 2)} unit="%" accent={(inf?.errors_perc ?? 0) > 1 ? "var(--red)" : "var(--green)"} />
              </div>
            </Card>

            <Card title="Resource Use" category="Inference Monitor" accent="var(--purple)">
              <Row label="CPU" value={fmt(res?.cpu_percent)} unit="%" accent="var(--purple)" />
              <MiniBar value={res?.cpu_percent ?? 0} max={100} color="var(--purple)" />
              <div style={{ marginTop: "0.75rem" }}>
                <Row label="Memory" value={fmt(res?.mem_mb, 0)} unit="MB" />
                <MiniBar value={res?.mem_mb ?? 0} max={res?.mem_limit_mb ?? 8192} color="var(--purple)" />
              </div>
            </Card>

            {/* Selected profile detail */}
            {selectedId && (() => {
              const sel = recommendations.find(r => r.id === selectedId);
              if (!sel) return null;
              const catColors = CATEGORY_COLORS[sel.category] || CATEGORY_COLORS["cloud-gpu"];
              return (
                <Card title="Selected" category="Configuration Output" accent={catColors.accent} style={{ animation: "fadeUp 0.3s ease" }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", color: catColors.accent, marginBottom: "0.5rem", fontWeight: 600 }}>
                    {sel.name}
                  </div>
                  {sel.gpu_model && (
                    <Row label="GPU" value={`${sel.gpu_count}× ${sel.gpu_model}`} />
                  )}
                  <Row label="VRAM" value={sel.vram_gb > 0 ? `${sel.vram_gb}GB` : "N/A"} />
                  <Row label="RAM"  value={`${sel.ram_gb}GB`} />
                  <Row label="Cost" value={sel.cost_per_hour === 0 ? "Owned" : `$${sel.cost_per_hour}/hr`} accent="var(--yellow)" />
                  <Row label="P95 est." value={sel.typical_p95_ms >= 1000 ? `${(sel.typical_p95_ms/1000).toFixed(1)}s` : `${sel.typical_p95_ms}ms`} accent="var(--teal)" />
                  <Row label="Max TPS" value={sel.max_throughput_tps} accent="var(--accent)" />

                  {/* Precision chips */}
                  <div style={{ display: "flex", gap: "0.3rem", marginTop: "0.6rem", flexWrap: "wrap" }}>
                    {[
                      { l: "FP8", v: sel.supports_fp8 }, { l: "BF16", v: sel.supports_bf16 },
                      { l: "FP16", v: sel.supports_fp16 }, { l: "INT8", v: sel.supports_int8 },
                      { l: "INT4", v: sel.supports_int4 },
                    ].filter(p => p.v).map(p => (
                      <span key={p.l} style={{ fontFamily: "var(--mono)", fontSize: "0.58rem", fontWeight: 600, padding: "0.2rem 0.4rem", borderRadius: 3, background: "rgba(57,217,138,0.08)", color: "var(--green)", border: "1px solid rgba(57,217,138,0.2)" }}>
                        {p.l}
                      </span>
                    ))}
                  </div>
                </Card>
              );
            })()}
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: "0.58rem", color: "var(--text2)", letterSpacing: "0.06em" }}>
            INFRASTRUCTURE ADVISOR · ADVISOR-BACKEND :9001 · INFERENCE-MONITOR :9000 · {health?.dbProfiles ?? 0} HARDWARE PROFILES
          </span>
          <span style={{ fontFamily: "var(--mono)", fontSize: "0.58rem", color: "var(--text2)" }}>
            {new Date().toLocaleTimeString()}
          </span>
        </div>
      </div>
    </>
  );
}
