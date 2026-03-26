export default function Dashboard() {
  const [snap, setSnap] = useState(null)

  useEffect(() => {
    const t = setInterval(async () => {
      const res = await fetch('/api/snapshot')
      setSnap(await res.json())
    }, 5000)
    return () => clearInterval(t)
  }, [])

  if (!snap) return null

  return (
    <div className="layout">
      <MetricCard title="Inference Latency">
        <Metric label="Avg" val={`${snap.inference.avg_ms} ms`} />
        <Metric label="P95" val={`${snap.inference.p95_ms} ms`} />
        <Metric label="P99" val={`${snap.inference.p99_ms} ms`} />
      </MetricCard>

      <MetricCard title="Throughput">
        {snap.inference.throughput_rps.toFixed(1)} rps
      </MetricCard>

      <MetricCard title="Resources">
        CPU {snap.resources.cpu_percent}%
        <br />
        MEM {snap.resources.mem_mb} MB
      </MetricCard>

      <MetricCard title="Cost (z)">
        {snap.cost.mips} MIPS
        <br />
        zIIP {snap.cost.ziip_percent}%
      </MetricCard>

      <MetricCard title="z/OS Integration">
        Success {snap.integration.zos_rest.success_rate}%
        <br />
        Latency {snap.integration.zos_rest.avg_latency_ms} ms
      </MetricCard>
    </div>
  )
}
