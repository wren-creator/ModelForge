// resource-collector.js
import fs from 'fs'

export function cpuUsage() {
  const stat = fs.readFileSync('/proc/stat', 'utf8')
  // simplified: you can do delta-based real usage
  return parseCpu(stat)
}

export function memUsageMb() {
  const mem = fs.readFileSync('/proc/meminfo', 'utf8')
  return parseMem(mem)
}
