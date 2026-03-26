// server.js
import express from 'express'
import { snapshotInference } from './inference-middleware.js'

const app = express()

app.get('/api/snapshot', (req, res) => {
  res.json({
    timestamp: Date.now(),
    inference: snapshotInference(5),
    resources: getResourceSnapshot(),
    cost: getCostSnapshot(),        // SMF-fed
    integration: getIntegration(),
    health: getHealth(),
  })
})

app.listen(9000)
