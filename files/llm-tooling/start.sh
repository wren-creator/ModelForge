#!/bin/bash
docker compose up -d

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║           LLM Tooling — Running Services         ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  ModelForge          →  http://localhost:3000    ║"
echo "║  Inference Monitor   →  http://localhost:3001    ║"
echo "║  Infra Advisor       →  http://localhost:3002    ║"
echo "║  Advisor Backend API →  http://localhost:9001    ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
