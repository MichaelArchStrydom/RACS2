// Runs on the Pi, not on Vercel. Fetches DashboardLive pages from this
// machine's own (residential) IP and hands the raw HTML back to RACS2

const http = require('http')
const crypto = require('crypto')
const { URL } = require('url')

const PORT = process.env.PORT || 8199
const SECRET = process.env.OSM_PROXY_SECRET
const BU = '{1B421B9F-6A82-4C06-8828-EEE7A2EC7694}'
const OSM_ID_RE = /^\{[0-9A-Fa-f-]{36}\}$/

if (!SECRET) {
  console.error('OSM_PROXY_SECRET env var not set')
  process.exit(1)
}
const SECRET_BUF = Buffer.from(SECRET)

function secretMatches(provided) {
  const providedBuf = Buffer.from(String(provided ?? ''))
  return providedBuf.length === SECRET_BUF.length && crypto.timingSafeEqual(providedBuf, SECRET_BUF)
}

async function fetchUpstream(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (RACS2 OSM proxy)' },
    signal: AbortSignal.timeout(15000),
  })
  const body = await res.text()
  return { status: res.status, body }
}

const server = http.createServer(async (req, res) => {
  if (!secretMatches(req.headers['x-osm-proxy-secret'])) {
    res.writeHead(401).end('unauthorized')
    return
  }

  const url = new URL(req.url, `http://${req.headers.host}`)

  try {
    if (url.pathname === '/musters') {
      const target = `https://www.dashboardlive.nz/musters.php?bu=${encodeURIComponent(BU)}`
      const { status, body } = await fetchUpstream(target)
      res.writeHead(status, { 'Content-Type': 'text/html' }).end(body)
      return
    }

    if (url.pathname === '/individual') {
      const id = url.searchParams.get('id') || ''
      if (!OSM_ID_RE.test(id)) {
        res.writeHead(400).end('invalid id')
        return
      }
      const target = `https://www.dashboardlive.nz/osmindividual.php?id=${encodeURIComponent(id)}&bu=${encodeURIComponent(BU)}`
      const { status, body } = await fetchUpstream(target)
      res.writeHead(status, { 'Content-Type': 'text/html' }).end(body)
      return
    }

    res.writeHead(404).end('not found')
  } catch (e) {
    console.error('osm-proxy: upstream fetch failed:', e)
    res.writeHead(502).end('upstream fetch failed')
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`osm-proxy listening on 127.0.0.1:${PORT}`)
})
