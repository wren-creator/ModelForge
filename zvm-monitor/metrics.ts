// metrics.ts
export interface InferenceMetrics {
  latency: {
    avg_ms: number
    p95_ms: number
    p99_ms: number
  }
  throughput_rps: number
  errors_perc: number
}

export interface ResourceMetrics {
  cpu_percent: number
  mem_mb: number
  gpu_util?: number
}

export interface CostMetrics {
  mips: number
  ziip_percent: number
}

export interface IntegrationMetrics {
  zos_rest: {
    success_rate: number
    avg_latency_ms: number
    timeouts: number
  }
}

export interface HealthMetrics {
  restarts: number
  startup_ms: number
  last_log_error?: string
}

export interface Snapshot {
  timestamp: number
  inference: InferenceMetrics
  resources: ResourceMetrics
  cost: CostMetrics
  integration: IntegrationMetrics
  health: HealthMetrics
}
