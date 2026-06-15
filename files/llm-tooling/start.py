#!/usr/bin/env python3
"""Start LLM Tooling services and open browser tabs once each is ready."""

import subprocess
import sys
import time
import urllib.request
import urllib.error
import webbrowser
from pathlib import Path

SERVICES = [
    {"name": "ModelForge",          "url": "http://localhost:3000", "probe": "http://localhost:3000"},
    {"name": "Inference Monitor",   "url": "http://localhost:3001", "probe": "http://localhost:3001"},
    {"name": "Infra Advisor",       "url": "http://localhost:3002", "probe": "http://localhost:3002"},
    {"name": "Advisor Backend API", "url": "http://localhost:9001", "probe": "http://localhost:9001/api/health"},
]

POLL_INTERVAL = 2   # seconds between readiness checks
TIMEOUT       = 120 # seconds before giving up on a service


def run_compose(args: list[str]) -> None:
    cmd = ["docker", "compose"] + args
    print(f"  Running: {' '.join(cmd)}\n")
    result = subprocess.run(cmd, cwd=Path(__file__).parent)
    if result.returncode != 0:
        sys.exit(result.returncode)


def is_up(url: str) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=3) as r:
            return r.status < 500
    except Exception:
        return False


def wait_for(service: dict) -> bool:
    name, probe = service["name"], service["probe"]
    deadline = time.monotonic() + TIMEOUT
    sys.stdout.write(f"  Waiting for {name} .")
    sys.stdout.flush()
    while time.monotonic() < deadline:
        if is_up(probe):
            print(" ready")
            return True
        sys.stdout.write(".")
        sys.stdout.flush()
        time.sleep(POLL_INTERVAL)
    print(f" timed out after {TIMEOUT}s")
    return False


def main() -> None:
    build = "--build" in sys.argv

    print("\n  LLM Tooling — starting services\n")
    compose_args = ["up", "-d"]
    if build:
        compose_args.append("--build")
    run_compose(compose_args)

    print()
    opened = []
    for svc in SERVICES:
        if wait_for(svc):
            opened.append(svc)

    print()
    for svc in opened:
        print(f"  Opening  {svc['name']:22s}  {svc['url']}")
        webbrowser.open(svc["url"])
        time.sleep(0.3)  # slight stagger so tabs open in order

    print()
    skipped = [s["name"] for s in SERVICES if s not in opened]
    if skipped:
        print(f"  Could not reach: {', '.join(skipped)}")
        print("  Check `docker compose logs` for details.")

    print()
    print("  ╔══════════════════════════════════════════════════╗")
    print("  ║           LLM Tooling — Running Services         ║")
    print("  ╠══════════════════════════════════════════════════╣")
    for svc in SERVICES:
        status = "✓" if svc in opened else "✗"
        print(f"  ║  {status}  {svc['name']:22s}  {svc['url']:<24s}║")
    print("  ╚══════════════════════════════════════════════════╝")
    print()
    print("  To stop:   docker compose down")
    print("  To logs:   docker compose logs -f")
    print()


if __name__ == "__main__":
    main()
