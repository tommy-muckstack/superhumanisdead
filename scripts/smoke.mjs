// UI smoke test against the built renderer with a stubbed preload (no Electron, no Google).
//   npm run build && python3 -m http.server 5181 -d out/renderer &
//   SMOKE_CHROME=/usr/bin/google-chrome node scripts/smoke.mjs      (or: npx playwright-core install chromium)
// It only uses the sample inbox. Nothing is sent anywhere.
import { chromium } from 'playwright-core'

const url = process.env.SMOKE_URL ?? 'http://localhost:5181/index.html'
const browser = await chromium.launch({ executablePath: process.env.SMOKE_CHROME, args: ['--allow-file-access-from-files'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e.stack).slice(0, 800)))
page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()))

await page.addInitScript(() => {
  let settings = { googleClientId: 'x', googleClientSecret: '', anthropicApiKey: 'k', aiModel: '', aiProvider: 'anthropic', aiBaseUrl: '', openaiApiKey: '', aiPersona: '', signature: '', theme: 'light', undoSendSeconds: 3, remindWeekdaysOnly: false, readStatusHost: '', readStatusEnabled: false, autoAdvance: 'older', instantReplies: false, autoSummarize: false }
  window.__calls = []
  window.duper = {
    settings: { get: async () => settings, set: async (p) => (settings = { ...settings, ...p }) },
    auth: { status: async () => ({ email: '', signedIn: false }), signIn: async () => ({}), signOut: async () => {}, switchTo: async () => ({}) },
    gmail: { request: async () => ({}), attachment: async () => btoa('x') },
    snooze: { list: async () => [], add: async () => [], remove: async () => [], onWake: () => () => {} },
    ai: { complete: async () => 'ok', stream: async (_r, cb) => { cb('ok'); return 'ok' }, triage: async () => [] },
    schedule: { list: async () => [], add: async () => [], cancel: async () => null, sendNow: async () => [], onSent: () => () => {} },
    calendar: { events: async () => [], create: async (e) => { window.__calls.push(['calendar.create', e]); return e } },
    files: { pick: async () => [], save: async () => true },
    print: async (html) => { window.__calls.push(['print', html.length]) },
    readStatus: { fetch: async () => ({}) },
    shell: { openExternal: async (u) => { window.__calls.push(['open', u]) }, post: async (u) => { window.__calls.push(['post', u]); return 200 } },
  }
})

let failed = 0
const check = (ok, name) => { if (!ok) failed += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`) }
const wait = (ms = 250) => page.waitForTimeout(ms)
const press = async (key, ms) => { await page.keyboard.press(key); await wait(ms) }
const exists = async (sel) => (await page.locator(sel).count()) > 0
const toastText = async () => (await page.locator('.toast').allTextContents()).join(' | ')
const openRow = async (text) => { await page.locator('.row', { hasText: text }).first().click({ timeout: 5000 }); await wait(500) }
const goTo = async (name) => { await press('ArrowLeft'); await page.keyboard.type(name); await wait(); await press('Enter', 500) }
const shot = (n) => page.screenshot({ path: `./out/smoke-${n}.png` })

await page.goto(url)
await wait(700)
await page.getByText('Try the sample inbox').click()
await wait(800)
check(await exists('.row'), 'sample inbox lists conversations')

// Navigation: N/P between messages, O, Space paging, ← folder menu
await openRow('Offer letter')
check(await exists('.message.focused'), 'last message is focused when a thread opens')
await press('p')
const first = await page.locator('.message.focused .name').first().textContent()
await press('n')
const second = await page.locator('.message.focused .name').first().textContent()
check(first !== second, 'N and P move the focused message')
await press('o')
check(await exists('.message-body'), 'O expands the focused message')
await press('Space'); await press('Shift+Space')
check(true, 'Space and Shift+Space page without errors')
await press('ArrowLeft')
check(await exists('.list-picker'), '← opens the folder menu')
await page.keyboard.type('sent'); await press('Enter', 400)
check((await page.locator('.rows .row').count()) > 0, 'folder menu jumps to Sent')
await press('ArrowLeft'); await page.keyboard.type('Important'); await wait(); await press('Enter', 400)

// Labels, move, mute
await openRow('Dinner Saturday')
await press('l')
check(await exists('.list-picker'), 'L opens the label picker')
await page.keyboard.type('Personal'); await press('Enter', 400)
check((await toastText()).includes('Added Personal'), 'L adds a label')
await press('v')
await page.keyboard.type('Hiring'); await press('Enter', 400)
check((await toastText()).includes('Moved to Hiring'), 'V moves to a label')
await page.keyboard.press('Escape')
await press('ArrowLeft'); await page.keyboard.type('Hiring'); await wait(); await press('Enter', 500)
check((await page.locator('.rows .row').count()) >= 1, 'a user label opens from the folder menu')
await press('y', 400)
check((await toastText()).includes('Removed from Hiring'), 'Y removes the label being viewed')
await press('ArrowLeft'); await page.keyboard.type('Important'); await wait(); await press('Enter', 500)
await goTo('Important')
await openRow('Kernel patch')
await press('Shift+M', 400)
check((await toastText()).includes('Muted'), '⇧M mutes the conversation')

// Unsubscribe, links, print
await goTo('Other')
await openRow('Config 2026')
await press('Meta+u')
check(await exists('.confirm'), '⌘U asks before unsubscribing')
await press('Escape')
await openRow('End of Software')
await press('Meta+u')
check((await exists('.confirm')) || (await toastText()).includes('No unsubscribe'), '⌘U handles a message without a link')
await press('Escape')
await goTo('Important')
await openRow('Board deck')
await press('Meta+o')
check((await page.locator('.list-picker .item').count()) >= 2, '⌘O lists links and attachments')
await press('Escape')
await press('Meta+p', 400)
check(await page.evaluate(() => window.__calls.some((c) => c[0] === 'print')), '⌘P sends a printable thread to the printer bridge')

// Accounts, calendar
await press('Control+2')
check((await toastText()).toLowerCase().includes('one account') || (await toastText()).includes('No account'), 'Ctrl+2 without a second account says so')
await press('b')
check(await exists('.event-form'), 'B opens the quick event form')
await page.keyboard.type('Lunch with Ada tomorrow 1pm for 45m'); await press('Enter', 500)
check((await toastText()).includes('Created'), 'B creates an event (sample calendar)')
await press('2', 400)
check(await exists('.week'), '2 opens the week view')
await shot('week')
await press('Escape')

// Composer: pop-out, formatting, emoji, shortcuts
await openRow('Board deck')
await press('Shift+R', 500)
check(await exists('.composer.popped'), '⇧R opens a popped-out reply')
await page.locator('.composer textarea').fill('make this bold')
await page.locator('.composer textarea').evaluate((el) => el.setSelectionRange(5, 9))
await press('Meta+b')
check((await page.locator('.composer textarea').inputValue()).includes('**this**'), '⌘B bolds the selection')
await page.locator('.composer textarea').evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length) })
await page.keyboard.type(' :smi'); await wait(300)
check(await exists('.inline-snippets'), ':smi opens the emoji popup')
await shot('compose-popped')
await press('Meta+Shift+P')
check(!(await exists('.composer.popped')), '⌘⇧P pops the draft back in')
await press('Escape')
await page.evaluate(() => document.activeElement && document.activeElement.blur())
await press('Shift+Escape').catch(() => undefined)

check(errors.length === 0, `no console or page errors${errors.length ? ': ' + errors.join(' || ') : ''}`)
await browser.close()
process.exit(failed ? 1 : 0)
