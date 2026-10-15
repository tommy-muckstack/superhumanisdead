// UI smoke test against the built renderer with a stubbed preload. Needs: npm i -D playwright-core && npx playwright install chromium
// Serve out/renderer (e.g. python3 -m http.server 5181 -d out/renderer) then: node scripts/smoke.mjs
import { chromium } from 'playwright-core'
const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e.stack).slice(0,1500)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await page.addInitScript(() => {
  let settings = { googleClientId: 'x', googleClientSecret: '', anthropicApiKey: 'k', aiModel: '', aiProvider: 'anthropic', aiBaseUrl: '', openaiApiKey: '', aiPersona: '', signature: '', theme: 'light', undoSendSeconds: 3, remindWeekdaysOnly: false, readStatusHost: '', autoAdvance: 'older', instantReplies: true, autoSummarize: true }
  const fake = async (r) => r.kind === 'instantReplies' ? 'Sounds good!\nLet me check\nNot this time' : r.kind === 'rewrite' ? 'REWRITTEN ' + r.text : 'Answer citing [1].'
  window.duper = {
    settings: { get: async () => settings, set: async (p) => (settings = { ...settings, ...p }) },
    auth: { status: async () => ({ email: '', signedIn: false }), signIn: async () => ({}), signOut: async () => {} },
    gmail: { request: async () => ({}) },
    snooze: { list: async () => [], add: async () => [], remove: async () => [], onWake: () => () => {} },
    ai: { complete: fake, stream: async (r, cb) => { const t = await fake(r); cb(t); return t }, triage: async () => [] },
    schedule: { list: async () => [], add: async () => [], cancel: async () => null, sendNow: async () => [], onSent: () => () => {} },
    calendar: { events: async () => [] },
    shell: { openExternal: async () => {} },
  }
})
await page.goto('process.env.SMOKE_URL ?? 'http://localhost:5181/index.html'')
await page.waitForTimeout(800)
const demo = page.getByText('Try the sample inbox')
await demo.click()
await page.waitForTimeout(800)
const shot = async (n) => page.screenshot({ path: `./out/smoke-${n}.png` })
await shot('inbox')
await page.keyboard.press('Meta+k'); await page.keyboard.type('remind'); await page.waitForTimeout(200); await shot('palette'); await page.keyboard.press('Escape')
await page.keyboard.press('h'); await page.waitForTimeout(200); await page.keyboard.type('tomorrow 3pm'); await page.waitForTimeout(200); await shot('remind'); await page.keyboard.press('Escape')
await page.keyboard.press('0'); await page.waitForTimeout(300); await shot('calendar')
await page.keyboard.press('Shift+?'); await page.waitForTimeout(300); await page.keyboard.type('What needs a reply'); await page.keyboard.press('Enter'); await page.waitForTimeout(300); await shot('askai'); await page.keyboard.press('Escape')
await page.keyboard.press('r'); await page.waitForTimeout(500); await page.keyboard.type('Hi ;sch'); await page.waitForTimeout(300); await shot('inline-snippet'); await page.keyboard.press('Enter'); await page.waitForTimeout(200)
await page.keyboard.press('Meta+Shift+L'); await page.waitForTimeout(200); await page.keyboard.press('1'); await page.waitForTimeout(200); await shot('compose')
await page.keyboard.press('Meta+Enter'); await page.waitForTimeout(300); await shot('scheduled')
await page.keyboard.press('/'); await page.keyboard.type('fr'); await page.waitForTimeout(200); await shot('search-hints')
await page.keyboard.press('Escape')
await page.evaluate(() => document.activeElement && document.activeElement.blur())
await page.keyboard.press('Meta+k'); await page.keyboard.type('dark theme'); await page.keyboard.press('Enter'); await page.waitForTimeout(300); await shot('dark')
console.log('errors:', JSON.stringify(errors, null, 1))
await browser.close()
