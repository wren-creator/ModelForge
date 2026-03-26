import { useState, useEffect } from "react";
 
const FONTS = `@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Syne:wght@400;600;700;800&display=swap');`;
 
const MODELS = [
  { label: "llama3.2:3b", value: "llama3.2:3b", family: "llama" },
  { label: "llama3.1:8b", value: "llama3.1:8b", family: "llama" },
  { label: "llama3.1:70b", value: "llama3.1:70b", family: "llama" },
  { label: "mistral:7b", value: "mistral:7b", family: "mistral" },
  { label: "mixtral:8x7b", value: "mixtral:8x7b", family: "mistral" },
  { label: "gemma2:9b", value: "gemma2:9b", family: "gemma" },
  { label: "gemma2:27b", value: "gemma2:27b", family: "gemma" },
  { label: "qwen2.5:7b", value: "qwen2.5:7b", family: "qwen" },
  { label: "qwen2.5:72b", value: "qwen2.5:72b", family: "qwen" },
  { label: "deepseek-r1:8b", value: "deepseek-r1:8b", family: "deepseek" },
  { label: "deepseek-r1:70b", value: "deepseek-r1:70b", family: "deepseek" },
  { label: "phi4:14b", value: "phi4:14b", family: "phi" },
  { label: "Custom / HuggingFace", value: "custom", family: "custom" },
];
 
const QUANT_OPTIONS = [
  { label: "None (full precision)", value: "none" },
  { label: "AWQ", value: "awq" },
  { label: "GPTQ", value: "gptq" },
  { label: "bitsandbytes (int8)", value: "bitsandbytes" },
  { label: "bitsandbytes (int4)", value: "bitsandbytes-nf4" },
  { label: "FP8", value: "fp8" },
  { label: "GGUF Q4_K_M (Ollama)", value: "q4_k_m" },
  { label: "GGUF Q5_K_M (Ollama)", value: "q5_k_m" },
  { label: "GGUF Q8_0 (Ollama)", value: "q8_0" },
];
 
const DTYPE_OPTIONS = [
  { label: "auto", value: "auto" },
  { label: "float16", value: "float16" },
  { label: "bfloat16", value: "bfloat16" },
  { label: "float32", value: "float32" },
];
 
const BACKENDS = ["Ollama", "vLLM", "llama.cpp", "LM Studio"];
 
function generateOllamaModelfile(cfg) {
  const modelName = cfg.customModel || cfg.model;
  let out = `FROM ${modelName}\n\n`;
 
  if (cfg.systemPrompt.trim()) {
    out += `SYSTEM """\n${cfg.systemPrompt.trim()}\n"""\n\n`;
  }
 
  out += `PARAMETER temperature ${cfg.temperature}\n`;
  out += `PARAMETER top_p ${cfg.topP}\n`;
 
  if (cfg.contextLength !== 2048) {
    out += `PARAMETER num_ctx ${cfg.contextLength}\n`;
  }
  if (cfg.maxTokens) {
    out += `PARAMETER num_predict ${cfg.maxTokens}\n`;
  }
  if (cfg.repeatPenalty !== 1.1) {
    out += `PARAMETER repeat_penalty ${cfg.repeatPenalty}\n`;
  }
  if (cfg.topK !== 40) {
    out += `PARAMETER top_k ${cfg.topK}\n`;
  }
  if (cfg.stopSequences.trim()) {
    cfg.stopSequences.split(",").map(s => s.trim()).filter(Boolean).forEach(s => {
      out += `PARAMETER stop "${s}"\n`;
    });
  }
 
  return out.trim();
}
 
function generateVLLMCommand(cfg) {
  const modelName = cfg.customModel || cfg.model;
  let parts = [`python -m vllm.entrypoints.openai.api_server`];
 
  parts.push(`  --model ${modelName}`);
 
  if (cfg.dtype !== "auto") {
    parts.push(`  --dtype ${cfg.dtype}`);
  }
 
  const quant = cfg.quantization;
  if (quant !== "none") {
    if (["awq", "gptq", "fp8"].includes(quant)) {
      parts.push(`  --quantization ${quant}`);
    } else if (quant === "bitsandbytes") {
      parts.push(`  --quantization bitsandbytes`);
      parts.push(`  --load-format bitsandbytes`);
    } else if (quant === "bitsandbytes-nf4") {
      parts.push(`  --quantization bitsandbytes`);
      parts.push(`  --load-format bitsandbytes`);
      parts.push(`  --bnb-4bit-quant-type nf4`);
    }
  }
 
  if (cfg.contextLength !== 2048) {
    parts.push(`  --max-model-len ${cfg.contextLength}`);
  }
  if (cfg.maxTokens) {
    parts.push(`  --max-new-tokens ${cfg.maxTokens}`);
  }
  if (cfg.gpuCount > 1) {
    parts.push(`  --tensor-parallel-size ${cfg.gpuCount}`);
  }
  if (cfg.gpuMemUtil !== 0.9) {
    parts.push(`  --gpu-memory-utilization ${cfg.gpuMemUtil}`);
  }
  if (cfg.host !== "0.0.0.0") {
    parts.push(`  --host ${cfg.host}`);
  }
  if (cfg.port !== 8000) {
    parts.push(`  --port ${cfg.port}`);
  }
  if (cfg.serveSystemPrompt && cfg.systemPrompt.trim()) {
    parts.push(`  --system-prompt "${cfg.systemPrompt.trim().replace(/"/g, '\\"')}"`);
  }
 
  return parts.join(" \\\n");
}
 
function generateLlamaCppCommand(cfg) {
  const modelName = cfg.customModel || cfg.model;
  let parts = [`./llama-server`];
  parts.push(`  -m models/${modelName}.gguf`);
  parts.push(`  --ctx-size ${cfg.contextLength}`);
  parts.push(`  --temp ${cfg.temperature}`);
  parts.push(`  --top-p ${cfg.topP}`);
  parts.push(`  --top-k ${cfg.topK}`);
  parts.push(`  --repeat-penalty ${cfg.repeatPenalty}`);
  if (cfg.maxTokens) parts.push(`  --n-predict ${cfg.maxTokens}`);
  if (cfg.gpuCount > 0) parts.push(`  --n-gpu-layers 99`);
  parts.push(`  --host ${cfg.host}`);
  parts.push(`  --port ${cfg.port}`);
  if (cfg.systemPrompt.trim()) {
    parts.push(`  --system-prompt "${cfg.systemPrompt.trim().replace(/"/g, '\\"')}"`);
  }
  return parts.join(" \\\n");
}
 
function generateLMStudioConfig(cfg) {
  const obj = {
    model: cfg.customModel || cfg.model,
    temperature: cfg.temperature,
    top_p: cfg.topP,
    top_k: cfg.topK,
    max_tokens: cfg.maxTokens || -1,
    context_length: cfg.contextLength,
    repeat_penalty: cfg.repeatPenalty,
    ...(cfg.systemPrompt.trim() ? { system_prompt: cfg.systemPrompt.trim() } : {}),
    ...(cfg.stopSequences.trim()
      ? { stop: cfg.stopSequences.split(",").map(s => s.trim()).filter(Boolean) }
      : {}),
  };
  return JSON.stringify(obj, null, 2);
}
 
function generateConfig(cfg, backend) {
  switch (backend) {
    case "Ollama": return generateOllamaModelfile(cfg);
    case "vLLM": return generateVLLMCommand(cfg);
    case "llama.cpp": return generateLlamaCppCommand(cfg);
    case "LM Studio": return generateLMStudioConfig(cfg);
    default: return "";
  }
}
 
const BACKEND_LABELS = {
  "Ollama": "Modelfile",
  "vLLM": "Launch Command",
  "llama.cpp": "Launch Command",
  "LM Studio": "JSON Config",
};
 
export default function App() {
  const [backend, setBackend] = useState("Ollama");
  const [copied, setCopied] = useState(false);
  const [cfg, setCfg] = useState({
    model: "llama3.1:8b",
    customModel: "",
    systemPrompt: "",
    temperature: 0.7,
    topP: 0.9,
    topK: 40,
    repeatPenalty: 1.1,
    contextLength: 2048,
    maxTokens: "",
    stopSequences: "",
    quantization: "none",
    dtype: "auto",
    gpuCount: 1,
    gpuMemUtil: 0.9,
    host: "0.0.0.0",
    port: 8000,
    serveSystemPrompt: true,
  });
 
  const set = (key, val) => setCfg(p => ({ ...p, [key]: val }));
  const output = generateConfig(cfg, backend);
 
  const handleCopy = () => {
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
 
  const isVLLM = backend === "vLLM";
  const isLlamaCpp = backend === "llama.cpp";
  const isOllama = backend === "Ollama";
 
  return (
    <>
      <style>{`
        ${FONTS}
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
 
        :root {
          --bg: #0a0c0f;
          --surface: #10141a;
          --surface2: #161b24;
          --border: #1e2a38;
          --border2: #243040;
          --accent: #00e5ff;
          --accent2: #ff6b35;
          --accent3: #7fff6b;
          --text: #c8d8e8;
          --text2: #6a8099;
          --text3: #3d5268;
          --mono: 'JetBrains Mono', monospace;
          --sans: 'Syne', sans-serif;
        }
 
        body {
          background: var(--bg);
          color: var(--text);
          font-family: var(--mono);
          min-height: 100vh;
          overflow-x: hidden;
        }
 
        .scanline {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0,229,255,0.012) 2px,
            rgba(0,229,255,0.012) 4px
          );
          pointer-events: none;
          z-index: 999;
        }
 
        .app {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem 1.5rem;
        }
 
        .header {
          margin-bottom: 2.5rem;
          border-bottom: 1px solid var(--border);
          padding-bottom: 1.5rem;
          position: relative;
        }
 
        .header::before {
          content: '';
          position: absolute;
          bottom: -1px;
          left: 0;
          width: 120px;
          height: 2px;
          background: var(--accent);
          box-shadow: 0 0 12px var(--accent);
        }
 
        .header-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
        }
 
        .title-block {}
 
        .eyebrow {
          font-family: var(--mono);
          font-size: 0.65rem;
          font-weight: 500;
          letter-spacing: 0.2em;
          color: var(--accent);
          text-transform: uppercase;
          margin-bottom: 0.4rem;
        }
 
        h1 {
          font-family: var(--sans);
          font-size: clamp(1.6rem, 4vw, 2.4rem);
          font-weight: 800;
          color: #e8f4ff;
          letter-spacing: -0.02em;
          line-height: 1.1;
        }
 
        h1 span {
          color: var(--accent);
        }
 
        .subtitle {
          font-size: 0.78rem;
          color: var(--text2);
          margin-top: 0.5rem;
          letter-spacing: 0.02em;
        }
 
        /* Backend tabs */
        .backend-tabs {
          display: flex;
          gap: 0.25rem;
          background: var(--surface);
          padding: 0.25rem;
          border-radius: 6px;
          border: 1px solid var(--border);
          align-self: flex-start;
          flex-wrap: wrap;
        }
 
        .tab {
          font-family: var(--mono);
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.05em;
          padding: 0.45rem 1rem;
          border-radius: 4px;
          border: none;
          cursor: pointer;
          background: transparent;
          color: var(--text2);
          transition: all 0.15s;
          text-transform: uppercase;
        }
 
        .tab:hover { color: var(--text); background: var(--surface2); }
 
        .tab.active {
          background: var(--accent);
          color: #000;
          box-shadow: 0 0 16px rgba(0,229,255,0.35);
        }
 
        /* Layout */
        .layout {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
          align-items: start;
        }
 
        @media (max-width: 800px) {
          .layout { grid-template-columns: 1fr; }
        }
 
        /* Panels */
        .panel {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          overflow: hidden;
        }
 
        .panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1rem;
          border-bottom: 1px solid var(--border);
          background: var(--surface2);
        }
 
        .panel-title {
          font-size: 0.65rem;
          font-weight: 600;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: var(--text2);
        }
 
        .panel-badge {
          font-size: 0.6rem;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 0.2rem 0.5rem;
          border-radius: 3px;
          background: rgba(0,229,255,0.08);
          color: var(--accent);
          border: 1px solid rgba(0,229,255,0.2);
        }
 
        .panel-body {
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
 
        /* Form fields */
        .field {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
 
        label {
          font-size: 0.65rem;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--text2);
        }
 
        label .hint {
          font-size: 0.6rem;
          color: var(--text3);
          font-weight: 400;
          letter-spacing: 0.04em;
          text-transform: none;
          margin-left: 0.4rem;
        }
 
        input, select, textarea {
          font-family: var(--mono);
          font-size: 0.8rem;
          background: var(--bg);
          color: var(--text);
          border: 1px solid var(--border2);
          border-radius: 5px;
          padding: 0.5rem 0.7rem;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
          width: 100%;
          -webkit-appearance: none;
        }
 
        input:focus, select:focus, textarea:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 2px rgba(0,229,255,0.1);
        }
 
        textarea {
          resize: vertical;
          min-height: 80px;
          line-height: 1.5;
        }
 
        select {
          cursor: pointer;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236a8099' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 0.75rem center;
          padding-right: 2rem;
        }
 
        /* Slider */
        .slider-row {
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }
 
        input[type=range] {
          -webkit-appearance: auto;
          padding: 0;
          height: 4px;
          flex: 1;
          accent-color: var(--accent);
          background: var(--border2);
          border: none;
          border-radius: 2px;
          cursor: pointer;
          box-shadow: none;
        }
 
        .slider-val {
          font-size: 0.78rem;
          color: var(--accent);
          font-weight: 600;
          min-width: 2.8rem;
          text-align: right;
        }
 
        /* Grid 2-col */
        .field-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.75rem;
        }
 
        /* Section divider */
        .section-divider {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          margin: 0.25rem 0;
        }
 
        .section-divider span {
          font-size: 0.58rem;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: var(--text3);
          white-space: nowrap;
          font-weight: 600;
        }
 
        .section-divider::before, .section-divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: var(--border);
        }
 
        /* Output panel */
        .output-panel {
          position: sticky;
          top: 1.5rem;
        }
 
        .output-code {
          padding: 1rem;
          font-family: var(--mono);
          font-size: 0.75rem;
          line-height: 1.7;
          color: #a8d4f0;
          white-space: pre;
          overflow-x: auto;
          min-height: 200px;
          background: #070a0d;
          border-bottom: 1px solid var(--border);
        }
 
        .output-code .kw { color: #ff6b35; font-weight: 600; }
        .output-code .val { color: #7fff6b; }
        .output-code .comment { color: var(--text3); }
        .output-code .str { color: #ffd166; }
        .output-code .flag { color: #c084fc; }
        .output-code .num { color: #00e5ff; }
 
        .output-footer {
          padding: 0.75rem 1rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          background: var(--surface2);
        }
 
        .output-meta {
          font-size: 0.62rem;
          color: var(--text3);
          letter-spacing: 0.06em;
        }
 
        .copy-btn {
          font-family: var(--mono);
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          padding: 0.45rem 1.1rem;
          border-radius: 4px;
          border: 1px solid var(--accent);
          background: transparent;
          color: var(--accent);
          cursor: pointer;
          transition: all 0.15s;
        }
 
        .copy-btn:hover {
          background: var(--accent);
          color: #000;
          box-shadow: 0 0 14px rgba(0,229,255,0.35);
        }
 
        .copy-btn.done {
          border-color: var(--accent3);
          color: var(--accent3);
          box-shadow: 0 0 12px rgba(127,255,107,0.25);
        }
 
        /* Toggle */
        .toggle-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
        }
 
        .toggle-label {
          font-size: 0.65rem;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--text2);
        }
 
        .toggle {
          position: relative;
          width: 36px;
          height: 20px;
          flex-shrink: 0;
        }
 
        .toggle input { opacity: 0; width: 0; height: 0; }
 
        .toggle-track {
          position: absolute;
          inset: 0;
          background: var(--border2);
          border-radius: 10px;
          cursor: pointer;
          transition: background 0.2s;
        }
 
        .toggle input:checked + .toggle-track {
          background: var(--accent);
          box-shadow: 0 0 8px rgba(0,229,255,0.4);
        }
 
        .toggle-track::after {
          content: '';
          position: absolute;
          left: 3px;
          top: 3px;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: white;
          transition: transform 0.2s;
        }
 
        .toggle input:checked + .toggle-track::after {
          transform: translateX(16px);
        }
 
        /* Syntax highlight helpers */
        .hl-keyword { color: #ff6b35; font-weight: 600; }
        .hl-value { color: #7fff6b; }
        .hl-string { color: #ffd166; }
        .hl-flag { color: #c084fc; }
        .hl-number { color: #00e5ff; }
        .hl-comment { color: #3d5268; font-style: italic; }
      `}</style>
 
      <div className="scanline" />
 
      <div className="app">
        <div className="header">
          <div className="header-top">
            <div className="title-block">
             <div className="eyebrow">
               // Universal Model Config Builder <span className="byline">By: Britley Hoff</span>
             </div>
              <h1>MODEL<span>FORGE</span></h1>
              <div className="subtitle">Generate backend configs for any LLM serving runtime</div>
            </div>
            <div className="backend-tabs">
              {BACKENDS.map(b => (
                <button key={b} className={`tab ${backend === b ? "active" : ""}`} onClick={() => setBackend(b)}>
                  {b}
                </button>
              ))}
            </div>
          </div>
        </div>
 
        <div className="layout">
          {/* Left: Settings */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Configuration</span>
              <span className="panel-badge">{backend}</span>
            </div>
            <div className="panel-body">
 
              {/* Model */}
              <div className="field">
                <label>Model</label>
                <select value={cfg.model} onChange={e => set("model", e.target.value)}>
                  {MODELS.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
 
              {cfg.model === "custom" && (
                <div className="field">
                  <label>Custom Model ID <span className="hint">HuggingFace path or local</span></label>
                  <input
                    type="text"
                    placeholder="meta-llama/Meta-Llama-3.1-8B-Instruct"
                    value={cfg.customModel}
                    onChange={e => set("customModel", e.target.value)}
                  />
                </div>
              )}
 
              {/* System Prompt */}
              <div className="field">
                <label>System Prompt <span className="hint">optional</span></label>
                <textarea
                  placeholder="You are a helpful assistant..."
                  value={cfg.systemPrompt}
                  onChange={e => set("systemPrompt", e.target.value)}
                />
              </div>
 
              {isVLLM && cfg.systemPrompt.trim() && (
                <div className="toggle-row">
                  <span className="toggle-label">Embed system prompt in server</span>
                  <label className="toggle">
                    <input type="checkbox" checked={cfg.serveSystemPrompt} onChange={e => set("serveSystemPrompt", e.target.checked)} />
                    <span className="toggle-track" />
                  </label>
                </div>
              )}
 
              <div className="section-divider"><span>Sampling</span></div>
 
              {/* Temperature */}
              <div className="field">
                <label>Temperature</label>
                <div className="slider-row">
                  <input type="range" min={0} max={2} step={0.05} value={cfg.temperature}
                    onChange={e => set("temperature", parseFloat(e.target.value))} />
                  <span className="slider-val">{cfg.temperature.toFixed(2)}</span>
                </div>
              </div>
 
              {/* Top P */}
              <div className="field">
                <label>Top P</label>
                <div className="slider-row">
                  <input type="range" min={0} max={1} step={0.01} value={cfg.topP}
                    onChange={e => set("topP", parseFloat(e.target.value))} />
                  <span className="slider-val">{cfg.topP.toFixed(2)}</span>
                </div>
              </div>
 
              <div className="field-grid">
                <div className="field">
                  <label>Top K</label>
                  <input type="number" min={1} max={200} value={cfg.topK}
                    onChange={e => set("topK", parseInt(e.target.value))} />
                </div>
                <div className="field">
                  <label>Repeat Penalty</label>
                  <input type="number" min={1} max={2} step={0.05} value={cfg.repeatPenalty}
                    onChange={e => set("repeatPenalty", parseFloat(e.target.value))} />
                </div>
              </div>
 
              <div className="section-divider"><span>Context & Output</span></div>
 
              <div className="field-grid">
                <div className="field">
                  <label>Context Length</label>
                  <select value={cfg.contextLength} onChange={e => set("contextLength", parseInt(e.target.value))}>
                    {[512,1024,2048,4096,8192,16384,32768,65536,131072].map(v => (
                      <option key={v} value={v}>{v.toLocaleString()}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Max Tokens <span className="hint">0=unlimited</span></label>
                  <input type="number" min={0} placeholder="unlimited"
                    value={cfg.maxTokens}
                    onChange={e => set("maxTokens", e.target.value ? parseInt(e.target.value) : "")} />
                </div>
              </div>
 
              {(isOllama || backend === "LM Studio") && (
                <div className="field">
                  <label>Stop Sequences <span className="hint">comma-separated</span></label>
                  <input type="text" placeholder="[INST], </s>, <|end|>"
                    value={cfg.stopSequences}
                    onChange={e => set("stopSequences", e.target.value)} />
                </div>
              )}
 
              <div className="section-divider"><span>Hardware & Precision</span></div>
 
              <div className="field">
                <label>Quantization</label>
                <select value={cfg.quantization} onChange={e => set("quantization", e.target.value)}>
                  {QUANT_OPTIONS
                    .filter(q => {
                      if (isOllama) return ["none","q4_k_m","q5_k_m","q8_0"].includes(q.value);
                      if (isVLLM) return !["q4_k_m","q5_k_m","q8_0"].includes(q.value);
                      if (isLlamaCpp) return ["none","q4_k_m","q5_k_m","q8_0"].includes(q.value);
                      return true;
                    })
                    .map(q => <option key={q.value} value={q.value}>{q.label}</option>)
                  }
                </select>
              </div>
 
              {(isVLLM) && (
                <div className="field">
                  <label>Data Type</label>
                  <select value={cfg.dtype} onChange={e => set("dtype", e.target.value)}>
                    {DTYPE_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
              )}
 
              {(isVLLM || isLlamaCpp) && (
                <div className="field-grid">
                  <div className="field">
                    <label>GPU Count</label>
                    <input type="number" min={1} max={16} value={cfg.gpuCount}
                      onChange={e => set("gpuCount", parseInt(e.target.value))} />
                  </div>
                  {isVLLM && (
                    <div className="field">
                      <label>GPU Mem Util</label>
                      <input type="number" min={0.1} max={1} step={0.05} value={cfg.gpuMemUtil}
                        onChange={e => set("gpuMemUtil", parseFloat(e.target.value))} />
                    </div>
                  )}
                </div>
              )}
 
              {(isVLLM || isLlamaCpp) && (
                <>
                  <div className="section-divider"><span>Server</span></div>
                  <div className="field-grid">
                    <div className="field">
                      <label>Host</label>
                      <input type="text" value={cfg.host} onChange={e => set("host", e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Port</label>
                      <input type="number" value={cfg.port} onChange={e => set("port", parseInt(e.target.value))} />
                    </div>
                  </div>
                </>
              )}
 
            </div>
          </div>
 
          {/* Right: Output */}
          <div className="panel output-panel">
            <div className="panel-header">
              <span className="panel-title">{BACKEND_LABELS[backend]}</span>
              <span className="panel-badge" style={{color: "var(--accent3)", borderColor: "rgba(127,255,107,0.25)", background: "rgba(127,255,107,0.06)"}}>
                {backend.toUpperCase()}
              </span>
            </div>
            <SyntaxOutput code={output} backend={backend} />
            <div className="output-footer">
              <span className="output-meta">{output.split("\n").length} lines · {output.length} chars</span>
              <button className={`copy-btn ${copied ? "done" : ""}`} onClick={handleCopy}>
                {copied ? "✓ Copied" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
 
function SyntaxOutput({ code, backend }) {
  const highlighted = highlight(code, backend);
  return (
    <div className="output-code" dangerouslySetInnerHTML={{ __html: highlighted }} />
  );
}
 
function esc(s) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
 
function highlight(code, backend) {
  const lines = code.split("\n");
  return lines.map(line => {
    const e = esc(line);
 
    if (backend === "Ollama") {
      return e
        .replace(/^(FROM|SYSTEM|PARAMETER|TEMPLATE|MESSAGE|LICENSE)(\b)/g, '<span class="hl-keyword">$1</span>$2')
        .replace(/"""([\s\S]*?)"""/g, '<span class="hl-string">"""$1"""</span>')
        .replace(/(\d+\.?\d*)/g, '<span class="hl-number">$1</span>');
    }
 
    if (backend === "vLLM" || backend === "llama.cpp") {
      return e
        .replace(/(python -m [a-z.]+|\.\/llama-server)/g, '<span class="hl-keyword">$1</span>')
        .replace(/(--[\w-]+)/g, '<span class="hl-flag">$1</span>')
        .replace(/(\d+\.?\d*)/g, '<span class="hl-number">$1</span>')
        .replace(/\\$/g, '<span class="hl-comment">\\</span>');
    }
 
    if (backend === "LM Studio") {
      return e
        .replace(/"([^"]+)":/g, '<span class="hl-keyword">"$1"</span>:')
        .replace(/: "([^"]*)"/g, ': <span class="hl-string">"$1"</span>')
        .replace(/: (\d+\.?\d*|true|false|null)/g, ': <span class="hl-number">$1</span>');
    }
 
    return e;
  }).join("\n");
}
