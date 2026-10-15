#!/usr/bin/env node
// Minimal read-status pixel host for SuperhumanIsDead. Run it somewhere you control:
//   PORT=8787 node tools/pixel-server.mjs
// then set Settings → Read statuses → host to https://your-host and turn it on.
//   GET /o/<token>.gif      records an open, returns a 1x1 gif
//   GET /opens?tokens=a,b   returns { token: [{ at, userAgent }] }  (only your app calls this)
// Opens are kept in memory and in opens.json next to this file. No IPs are stored.
import { createServer } from 'node:http'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const file = join(dirname(fileURLToPath(import.meta.url)), 'opens.json')
const opens = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
const save = () => writeFileSync(file, JSON.stringify(opens))

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x')
  const pixel = /^\/o\/([a-z0-9]{10,40})\.gif$/.exec(url.pathname)
  if (pixel) {
    ;(opens[pixel[1]] ??= []).push({ at: Date.now(), userAgent: req.headers['user-agent'] ?? '' })
    save()
    res.writeHead(200, { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, max-age=0' }).end(GIF)
    return
  }
  if (url.pathname === '/opens') {
    const tokens = (url.searchParams.get('tokens') ?? '').split(',').filter(Boolean).slice(0, 100)
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }).end(JSON.stringify(Object.fromEntries(tokens.map((t) => [t, opens[t] ?? []]))))
    return
  }
  res.writeHead(404).end()
}).listen(Number(process.env.PORT ?? 8787), () => console.log('pixel host listening'))
