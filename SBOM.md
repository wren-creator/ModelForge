# Software Bill of Materials (SBOM)

**Project:** llm-tooling  
**Version:** 1.0.0  
**Generated:** 2026-05-18  
**License:** MIT  
**Format:** Markdown (human-readable); CycloneDX/SPDX export recommended for automated tooling  

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Monorepo Component Map](#2-monorepo-component-map)
3. [Runtime Environments](#3-runtime-environments)
4. [Container Base Images](#4-container-base-images)
5. [Direct Production Dependencies](#5-direct-production-dependencies)
6. [Direct Development Dependencies](#6-direct-development-dependencies)
7. [Transitive Dependencies (Resolved)](#7-transitive-dependencies-resolved)
8. [CDN / External Assets](#8-cdn--external-assets)
9. [Infrastructure & Orchestration](#9-infrastructure--orchestration)
10. [License Summary](#10-license-summary)
11. [Known Deprecation Notices](#11-known-deprecation-notices)
12. [SBOM Maintenance Notes](#12-sbom-maintenance-notes)

---

## 1. Project Overview

`llm-tooling` is a self-contained, open-source observability and infrastructure planning platform for local and cloud LLM deployments. It is structured as a Docker Compose monorepo containing five services.

| Service | Role | Port |
|---|---|---|
| `modelforge` | LLM config builder UI | 3000 |
| `inference-monitor` | Live inference observability dashboard | 3001 |
| `infra-advisor` | Infrastructure advisor frontend | 3002 |
| `advisor-backend` | Central aggregator API + scoring engine | 9001 |
| `inference-backend` | Inference snapshot API (pluggable) | 9000 |

---

## 2. Monorepo Component Map

```
llm-tooling/
├── docker-compose.yml
├── modelforge/                  # React + Vite SPA → nginx:alpine
│   ├── package.json
│   ├── package-lock.json
│   ├── Dockerfile
│   ├── nginx.conf
│   └── src/App.jsx
├── inference_monitor/           # React + Vite SPA → nginx:alpine
│   ├── package.json
│   ├── package-lock.json
│   ├── Dockerfile
│   ├── nginx.conf
│   └── vite.config.js
├── infra-advisor/               # React + Vite SPA → nginx:alpine (proxies /api → advisor-backend)
│   ├── package.json
│   ├── package-lock.json
│   ├── Dockerfile
│   ├── nginx.conf
│   └── vite.config.js
└── advisor-backend/             # Node.js + Express API → node:20-alpine
    ├── package.json
    ├── package-lock.json
    ├── Dockerfile
    ├── server.js
    └── seed.js
```

---

## 3. Runtime Environments

| Component | Runtime | Minimum Version | Notes |
|---|---|---|---|
| modelforge | Node.js | 20 (build only) | Production: nginx:alpine |
| inference_monitor | Node.js | 20 (build only) | Production: nginx:alpine |
| infra-advisor | Node.js | 20 (build only) | Production: nginx:alpine |
| advisor-backend | Node.js | 20 | ESM module (`"type": "module"`) |
| All | npm | 9+ | Lockfile version 3 |

---

## 4. Container Base Images

| Service | Build Stage | Image | Version Tag | Notes |
|---|---|---|---|---|
| modelforge | builder | `node` | `20-alpine` | npm install + vite build |
| modelforge | serve | `nginx` | `alpine` | Serves `/app/dist` |
| inference_monitor | builder | `node` | `20-alpine` | npm install + vite build |
| inference_monitor | serve | `nginx` | `alpine` | Serves `/app/dist` |
| infra-advisor | builder | `node` | `20-alpine` | npm install + vite build |
| infra-advisor | serve | `nginx` | `alpine` | Serves `/app/dist`; proxies `/api/` → advisor-backend:9001 |
| advisor-backend | builder | `node` | `20-alpine` | Requires `python3 make g++` (native build for better-sqlite3) |
| advisor-backend | runtime | `node` | `20-alpine` | Requires `libstdc++` |
| inference-backend | — | `node` | `20-alpine` | Pluggable; runs from volume mount |

> **Platform:** All services are configured for `linux/arm64` in docker-compose.yml.

---

## 5. Direct Production Dependencies

### 5a. advisor-backend

| Package | Declared Version | Resolved Version | License | Purpose |
|---|---|---|---|---|
| `better-sqlite3` | `^9.4.3` | `9.6.0` | MIT | Embedded SQLite database for hardware profiles and advisor state |
| `cors` | `^2.8.5` | `2.8.5` | MIT | Express CORS middleware |
| `express` | `^4.18.3` | `4.18.3` | MIT | HTTP server and REST API routing |
| `node-cron` | `^3.0.3` | `3.0.3` | ISC | Scheduled polling of inference monitor snapshot API |
| `node-fetch` | `^3.3.2` | `3.3.2` | MIT | HTTP client for polling inference-backend `/api/snapshot` |

### 5b. modelforge

| Package | Declared Version | Resolved Version | License | Purpose |
|---|---|---|---|---|
| `react` | `^18.2.0` | `18.3.1` | MIT | UI component framework |
| `react-dom` | `^18.2.0` | `18.3.1` | MIT | React DOM renderer |

### 5c. inference_monitor

| Package | Declared Version | Resolved Version | License | Purpose |
|---|---|---|---|---|
| `react` | `^18.2.0` | `18.3.1` | MIT | UI component framework |
| `react-dom` | `^18.2.0` | `18.3.1` | MIT | React DOM renderer |

### 5d. infra-advisor

| Package | Declared Version | Resolved Version | License | Purpose |
|---|---|---|---|---|
| `react` | `^18.2.0` | `18.3.1` | MIT | UI component framework |
| `react-dom` | `^18.2.0` | `18.3.1` | MIT | React DOM renderer |

---

## 6. Direct Development Dependencies

Shared across all three frontend services (modelforge, inference_monitor, infra-advisor):

| Package | Declared Version | Resolved Version | License | Purpose |
|---|---|---|---|---|
| `@vitejs/plugin-react` | `^4.2.1` | `4.7.0` | MIT | Vite plugin: Babel-based React Fast Refresh + JSX transform |
| `vite` | `5.2.14` / `^5.4.11` | `5.2.14` / `5.4.x` | MIT | Frontend build tool and dev server |

> **Note:** `infra-advisor` pins `vite` at `5.2.14`; `modelforge` and `inference_monitor` use `^5.4.11`.

---

## 7. Transitive Dependencies (Resolved)

### 7a. advisor-backend — transitive tree

#### better-sqlite3 subtree
| Package | Version | License | Role |
|---|---|---|---|
| `bindings` | `1.5.0` | MIT | Native Node addon bindings helper |
| `file-uri-to-path` | `1.0.0` | MIT | URI-to-path conversion for bindings |
| `prebuild-install` | `7.x` | MIT | Downloads or builds native prebuilt binaries |
| `detect-libc` | `^2.0.0` | Apache-2.0 | libc detection for native prebuilds |
| `expand-template` | `^2.0.3` | MIT | Template expansion for download URLs |
| `github-from-package` | `0.0.0` | MIT | Extracts GitHub repo from package.json |
| `minimist` | `^1.2.3` | MIT | Argument parser (prebuild-install CLI) |
| `mkdirp-classic` | `^0.5.3` | MIT | mkdir -p implementation |
| `napi-build-utils` | `^2.0.0` | MIT | NAPI version detection utilities |
| `node-abi` | `3.92.0` | MIT | Node ABI version mapping |
| `pump` | `3.0.4` | MIT | Stream piping with error propagation |
| `rc` | `^1.2.7` | (BSD-2/MIT) | Runtime configuration loader |
| `simple-get` | `^4.0.0` | MIT | Minimal HTTP GET client |
| `tar-fs` | `^2.0.0` | MIT | Filesystem tar pack/unpack |
| `tunnel-agent` | `^0.6.0` | Apache-2.0 | HTTPS tunnel agent for proxied requests |

#### express subtree
| Package | Version | License | Role |
|---|---|---|---|
| `accepts` | `1.3.8` | MIT | Content negotiation |
| `array-flatten` | `1.1.1` | MIT | Array utility |
| `body-parser` | `1.20.x` | MIT | Request body parsing |
| `content-disposition` | `0.5.4` | MIT | Content-Disposition header |
| `content-type` | `1.0.5` | MIT | Content-Type header parsing |
| `cookie` | `0.7.x` | MIT | Cookie serialization/parsing |
| `cookie-signature` | `1.0.6` | MIT | Cookie signing |
| `debug` | `2.6.9` / `4.4.3` | MIT | Debug logging |
| `depd` | `2.0.0` | MIT | Deprecation warnings |
| `encodeurl` | `~2.0.0` | MIT | URL encoding |
| `escape-html` | `~1.0.3` | MIT | HTML escaping |
| `etag` | `~1.8.1` | MIT | ETag generation |
| `finalhandler` | `1.3.2` | MIT | Final HTTP handler |
| `forwarded` | `0.2.0` | MIT | Forwarded header parsing |
| `fresh` | `0.5.2` | MIT | HTTP cache freshness |
| `http-errors` | `2.0.1` | MIT | HTTP error constructors |
| `iconv-lite` | `0.4.24` | MIT | Character encoding conversion |
| `inherits` | `~2.0.4` | ISC | Prototype inheritance |
| `ipaddr.js` | `1.9.1` | MIT | IP address parsing |
| `media-typer` | `0.3.0` | MIT | MIME type parsing |
| `merge-descriptors` | `1.0.3` | MIT | Object descriptor merging |
| `methods` | `~1.1.2` | MIT | HTTP method list |
| `mime` | `1.6.0` | MIT | MIME type lookup |
| `mime-db` | `1.52.0` | MIT | MIME type database |
| `mime-types` | `~2.1.34` | MIT | MIME type utilities |
| `ms` | `2.0.0` / `2.1.3` | MIT | Milliseconds conversion |
| `negotiator` | `0.6.3` | MIT | HTTP content negotiation |
| `on-finished` | `~2.4.1` | MIT | Execute callback when HTTP request finished |
| `parseurl` | `~1.3.3` | MIT | URL parsing with memoization |
| `path-to-regexp` | `0.1.12` | MIT | Path to RegExp conversion |
| `proxy-addr` | `2.0.7` | MIT | Proxy address determination |
| `qs` | `6.15.1` | BSD-3-Clause | Query string parsing |
| `range-parser` | `1.2.1` | MIT | HTTP Range header parser |
| `raw-body` | `2.5.2` | MIT | Raw request body reader |
| `safer-buffer` | `>= 2.1.2 < 3` | MIT | Safe Buffer shim |
| `send` | `0.19.0` | MIT | File stream utility |
| `serve-static` | `1.16.2` | MIT | Static file serving |
| `setprototypeof` | `~1.2.0` | ISC | Object.setPrototypeOf shim |
| `statuses` | `~2.0.2` | MIT | HTTP status code data |
| `toidentifier` | `~1.0.1` | MIT | String to identifier |
| `type-is` | `~1.6.18` | MIT | Request content-type detection |
| `unpipe` | `~1.0.0` | MIT | Unpipe a stream |
| `utils-merge` | `1.0.1` | MIT | Object merging utility |
| `vary` | `~1.1.2` | MIT | Vary response header management |

#### node-cron subtree
| Package | Version | License | Role |
|---|---|---|---|
| `uuid` | `8.3.2` | MIT | UUID generation for cron job IDs |

#### node-fetch subtree
| Package | Version | License | Role |
|---|---|---|---|
| `data-uri-to-buffer` | `^4.0.0` | MIT | Data URI to Buffer conversion |
| `fetch-blob` | `3.2.0` | MIT | Blob implementation for node-fetch |
| `formdata-polyfill` | `4.0.10` | MIT | FormData polyfill |
| `node-domexception` | `1.0.0` | MIT | ⚠ **Deprecated** — DOMException polyfill (see §11) |
| `web-streams-polyfill` | `^3.0.3` | MIT | WHATWG Streams polyfill |

#### cors subtree
| Package | Version | License | Role |
|---|---|---|---|
| `object-assign` | `4.1.1` | MIT | Object.assign polyfill |
| `vary` | `~1.1.2` | MIT | (shared with express) |

#### Shared utility packages
| Package | Version | License | Role |
|---|---|---|---|
| `bl` | `4.1.0` | MIT | Buffer list (used by tar-fs / pump) |
| `buffer` | `5.7.1` | MIT | Buffer polyfill |
| `end-of-stream` | `^1.1.0` | MIT | Callback when stream ends |
| `gopd` | `1.2.0` | MIT | Object.getOwnPropertyDescriptor helper |
| `has-symbols` | `1.1.0` | MIT | Symbol detection |
| `hasown` | `2.0.3` | MIT | Object.hasOwn shim |
| `function-bind` | `^1.1.2` | MIT | Function.prototype.bind shim |
| `ieee754` | `1.2.1` | MIT | IEEE 754 float encoding |
| `once` | `^1.3.1` | ISC | One-time function wrapper |
| `side-channel` | `^1.1.0` | MIT | WeakMap-based side channel |
| `wrappy` | `1` | ISC | Callback wrapper utility |

---

### 7b. Frontend services — transitive tree (shared across modelforge, inference_monitor, infra-advisor)

#### @vitejs/plugin-react subtree
| Package | Version | License | Role |
|---|---|---|---|
| `@babel/core` | `7.29.0` | MIT | Babel compiler core |
| `@babel/code-frame` | `7.29.0` | MIT | Error code frame formatting |
| `@babel/compat-data` | `7.29.3` | MIT | Browser compatibility data for Babel targets |
| `@babel/generator` | `7.29.1` | MIT | AST-to-code generation |
| `@babel/helper-compilation-targets` | `^7.28.6` | MIT | Compilation target resolution |
| `@babel/helper-globals` | `^7.28.0` | MIT | Global variable helpers |
| `@babel/helper-module-transforms` | `^7.28.6` | MIT | Module transformation helpers |
| `@babel/helper-plugin-utils` | `^7.27.1` | MIT | Plugin utility helpers |
| `@babel/helper-string-parser` | `^7.27.1` | MIT | String parsing utilities |
| `@babel/helper-validator-identifier` | `^7.28.5` | MIT | JS identifier validation |
| `@babel/helpers` | `^7.28.6` | MIT | Babel runtime helpers |
| `@babel/parser` | `^7.29.0` | MIT | JS/TS/JSX parser |
| `@babel/plugin-transform-react-jsx-self` | `^7.27.1` | MIT | Adds `__self` prop to JSX |
| `@babel/plugin-transform-react-jsx-source` | `7.27.1` | MIT | Adds `__source` prop to JSX |
| `@babel/template` | `7.28.6` | MIT | AST template generation |
| `@babel/traverse` | `7.29.0` | MIT | AST traversal |
| `@babel/types` | `7.29.0` | MIT | AST node type definitions |
| `@jridgewell/gen-mapping` | `0.3.13` | MIT | Source map generation |
| `@jridgewell/remapping` | `2.3.5` | MIT | Source map remapping |
| `@jridgewell/sourcemap-codec` | `^1.5.0` | MIT | Source map encoding/decoding |
| `@jridgewell/trace-mapping` | `^0.3.24` | MIT | Source map trace resolution |
| `@rolldown/pluginutils` | `1.0.0-beta.27` | MIT | Rolldown plugin utility helpers |
| `@types/babel__core` | `^7.20.5` | MIT | TypeScript types for Babel core |
| `@types/babel__generator` | `7.27.0` | MIT | TypeScript types for Babel generator |
| `@types/babel__template` | `7.4.4` | MIT | TypeScript types for Babel template |
| `@types/babel__traverse` | `7.28.0` | MIT | TypeScript types for Babel traverse |
| `@types/estree` | `1.0.8` | MIT | TypeScript types for ESTree AST |
| `convert-source-map` | `2.0.0` | MIT | Source map format conversion |
| `debug` | `4.4.3` | MIT | Debug logging |
| `gensync` | `^1.0.0-beta.2` | MIT | Generator-based async/sync unification |
| `js-tokens` | `^4.0.0` | MIT | JavaScript tokenizer |
| `json5` | `^2.2.3` | MIT | JSON with comments/trailing commas |
| `ms` | `^2.1.3` | MIT | Milliseconds conversion |
| `picocolors` | `1.1.1` | ISC | Terminal color output |
| `react-refresh` | `0.17.0` | MIT | React Fast Refresh runtime |
| `semver` | `^6.3.1` | ISC | Semantic version parsing |

#### vite subtree
| Package | Version | License | Role |
|---|---|---|---|
| `baseline-browser-mapping` | `2.10.29` | Apache-2.0 | Browser baseline compatibility data |
| `browserslist` | `4.28.2` | MIT | Browser target query resolution |
| `caniuse-lite` | `1.0.30001792` | CC-BY-4.0 | Can I Use browser support database |
| `electron-to-chromium` | `^1.5.328` | MIT | Electron-to-Chromium version mapping |
| `esbuild` | `^0.20.1` | MIT | JS/TS bundler and minifier (Vite core) |
| `@esbuild/aix-ppc64` | `0.20.2` | MIT | esbuild optional platform binary |
| `@esbuild/linux-arm64` | `0.20.2` | MIT | esbuild optional platform binary |
| `@esbuild/linux-x64` | `0.20.2` | MIT | esbuild optional platform binary |
| `@esbuild/win32-arm64` | `0.20.2` | MIT | esbuild optional platform binary |
| `@esbuild/win32-ia32` | `0.20.2` | MIT | esbuild optional platform binary |
| `@esbuild/win32-x64` | `0.20.2` | MIT | esbuild optional platform binary |
| `@esbuild/sunos-x64` | `0.20.2` | MIT | esbuild optional platform binary |
| `@esbuild/openbsd-x64` | `0.20.2` | MIT | esbuild optional platform binary |
| `fsevents` | `~2.3.3` | MIT | macOS file-system events (optional) |
| `nanoid` | `^3.3.11` | MIT | Unique ID generation (used by postcss) |
| `node-releases` | `2.0.44` | MIT | Node.js release data for browserslist |
| `postcss` | `8.5.14` | MIT | CSS transformation (Vite dependency) |
| `rollup` | `^4.13.0` | MIT | Module bundler (Vite core) |
| `source-map-js` | `^1.2.1` | BSD-3-Clause | Source map support for postcss |
| `update-browserslist-db` | `1.2.3` | MIT | Browserslist database updater |
| `yallist` | `3.1.1` | ISC | Doubly-linked list (used by rollup) |

#### react subtree
| Package | Version | License | Role |
|---|---|---|---|
| `loose-envify` | `^1.1.0` | MIT | Environment variable replacement |
| `scheduler` | `^0.23.2` | MIT | React cooperative scheduling |

---

## 8. CDN / External Assets

> These are loaded at **browser runtime**, not bundled into the application. They are outside npm dependency management.

| Service | Asset | Provider | URL | Version/Notes |
|---|---|---|---|---|
| modelforge | JetBrains Mono font | Google Fonts | `fonts.googleapis.com` | Latest via CDN |
| modelforge | Syne font | Google Fonts | `fonts.googleapis.com` | Latest via CDN |
| inference_monitor | *(none detected)* | — | — | — |
| infra-advisor | *(none detected)* | — | — | — |

> **Privacy note:** Google Fonts requests may log IP addresses per Google's privacy policy. Consider self-hosting fonts for air-gapped or privacy-sensitive deployments.

---

## 9. Infrastructure & Orchestration

| Component | Technology | Version | License | Notes |
|---|---|---|---|---|
| Container orchestration | Docker Compose | v2+ | Apache-2.0 | Defined in `docker-compose.yml` |
| Frontend web server | nginx | alpine (latest) | BSD-2-Clause | Serves built Vite output; reverse-proxies `/api/` for infra-advisor |
| Build environment | Node.js | 20-alpine | MIT | Alpine Linux base |
| Database | SQLite (via better-sqlite3) | embedded | Public Domain | `advisor.db`; WAL mode enabled |
| Database seeding | `node seed.js` | — | MIT (project) | Run at Docker build time |
| Cron scheduling | node-cron | 3.0.3 | ISC | Polls inference-backend every 5 seconds |

---

## 10. License Summary

| License | Package Count (approx.) | Packages |
|---|---|---|
| MIT | ~85 | Most npm packages, Node.js, React, Vite, Express, esbuild, rollup, Babel, etc. |
| ISC | ~8 | `node-cron`, `semver`, `picocolors`, `yallist`, `inherits`, `once`, `wrappy`, `setprototypeof` |
| BSD-2-Clause | 1 | nginx |
| BSD-3-Clause | 2 | `qs`, `source-map-js` |
| Apache-2.0 | 2 | `detect-libc`, `tunnel-agent`, `baseline-browser-mapping` |
| CC-BY-4.0 | 1 | `caniuse-lite` *(data only, not code)* |
| Public Domain | 1 | SQLite |

> All licenses are permissive. No GPL, LGPL, AGPL, or copyleft components are present in this dependency tree.

---

## 11. Known Deprecation Notices

| Package | Version | Status | Action |
|---|---|---|---|
| `node-domexception` | `1.0.0` | ⚠️ **Deprecated** — "Use your platform's native DOMException instead" | Transitive dep of `node-fetch` → `fetch-blob`. No direct action needed; will resolve when `node-fetch` or `fetch-blob` drops the dependency in a future release. Monitor for updates. |

---

## 12. SBOM Maintenance Notes

- **Update cadence:** Regenerate this SBOM whenever `package.json` or `package-lock.json` files are changed in any service.
- **Automated tooling:** For CI/CD integration, consider generating a machine-readable SBOM alongside this document using:
  ```bash
  # CycloneDX format (recommended)
  npx @cyclonedx/cyclonedx-npm --output-format json --output-file sbom.cdx.json

  # SPDX format
  npx spdx-sbom-generator
  ```
- **Vulnerability scanning:** Run `npm audit` in each service directory, or use `docker scout` / `grype` against built images.
- **Native binary audit:** `better-sqlite3` compiles a native Node addon. Ensure the `node:20-alpine` builder image is regularly pulled to pick up Alpine security patches that affect `python3`, `make`, `g++`, and `libstdc++`.
- **CDN dependency risk:** Google Fonts (JetBrains Mono, Syne) in ModelForge are an unversioned external dependency. Pin via subresource integrity (SRI) hashes or self-host for production hardening.
