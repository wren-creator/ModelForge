// inference-middleware.js
import hdr from 'hdr-histogram-js'

const histogram = hdr.build({
  lowestDiscernibleValue: 1,
  highestTrackableValue: 60000,
  numberOfSignificantValueDigits: 3,
})

let count = 0
let errors = 0

export function recordInference(durationMs, ok = true) {
  histogram.recordValue(durationMs)
  count++
  if (!ok) errors++
}

export function snapshotInference(intervalSec) {
  const snap = {
    avg_ms: histogram.getMean(),
    p95_ms: histogram.getValueAtPercentile(95),
    p99_ms: histogram.getValueAtPercentile(99),
    throughput_rps: count / intervalSec,
    errors_perc: count ? (errors / count) * 100 : 0,
  }

  histogram.reset()
  count = 0
  errors = 0

  return snap
}
