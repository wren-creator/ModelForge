# ModelForge
LLM Model file builder for local LLM's

# ModelForge
 
> Universal LLM model config builder :: generate backend configs for Ollama, vLLM, llama.cpp, and LM Studio from a single UI.
 
---
 
## Prerequisites
 
- [Node.js](https://nodejs.org/) v18 or higher
- npm v9 or higher
 
---
 
## Quick Start
 
### 1. Scaffold the project
 
```bash
npm create vite@latest modelforge -- --template react
```
 
When prompted, confirm the project name and select **React** as the framework and **JavaScript** as the variant.
 
### 2. Install dependencies
 
```bash
cd modelforge
npm install
```
 
### 3. Drop in the app
 
Replace the default `App.jsx` with the downloaded `model-config-builder.jsx`:
 
```bash
# Mac / Linux
cp ~/Downloads/model-config-builder.jsx src/App.jsx
 
# Windows (PowerShell)
Copy-Item "$env:USERPROFILE\Downloads\model-config-builder.jsx" src\App.jsx
```
 
### 4. Start the dev server
 
```bash
npm run dev
```
 
Open your browser at **http://localhost:5173**, ModelForge will be running with hot reload enabled.
 
---
 
## Features
 
- **4 backends:** Ollama (Modelfile), vLLM (launch command), llama.cpp (server command), LM Studio (JSON config)
- **Live output:** config updates in real time as you adjust settings
- **Smart filtering:** quantization and precision options change based on what each runtime actually supports
- **Syntax highlighting:** color-coded output per config format
- **One-click copy:** grab the full config to clipboard instantly
 
---
 
## Supported Backends
 
| Backend | Output Format | Notes |
|---|---|---|
| Ollama | `Modelfile` | Includes `FROM`, `SYSTEM`, `PARAMETER` blocks |
| vLLM | Shell command | Supports AWQ, GPTQ, FP8, bitsandbytes, tensor parallelism |
| llama.cpp | Shell command | `llama-server` flags with GPU layer offload |
| LM Studio | JSON config | Drop into LM Studio's model settings |
 
---
 
## Notes
 
- No extra packages are required beyond the default Vite React template, all imports (`useState`, `useEffect`) are covered by it.
- Google Fonts (JetBrains Mono, Syne) are loaded via CDN, an internet connection is needed for the correct typography to render.
 
---
 
## Project Structure
 
```
modelforge/
├── src/
│   └── App.jsx        ← ModelForge app (paste here)
├── index.html
├── package.json
└── vite.config.js
```
