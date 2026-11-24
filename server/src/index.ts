import './env.js'
import { createApp } from './app.js'
import { config, hasGoogle, hasLlm, hasStt, hasTelegram } from './config.js'
import { Store } from './store.js'

const store = new Store(config.dataFile)
const { app, queue } = createApp({ store })
queue.start()

if (!process.env.SESSION_SECRET) console.warn('[nextup] SESSION_SECRET not set: phone sessions reset on every restart.')
console.log(
  `[nextup] integrations: google=${hasGoogle()} telegram=${hasTelegram()} llm=${hasLlm()} stt=${hasStt()}` +
    (hasGoogle() ? '' : ' (demo data only)'),
)

const server = app.listen(config.port, () => console.log(`[nextup] listening on :${config.port} · ${config.publicUrl}`))

for (const sig of ['SIGINT', 'SIGTERM'] as const)
  process.on(sig, () => {
    queue.stop()
    store.flush()
    server.close(() => process.exit(0))
  })
