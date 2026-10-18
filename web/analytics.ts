// PostHog for the SuperhumanIsDead website (shared IsDead project 666931, US cloud).
// Contract: yourappisdead/ANALYTICS.md; this site's events: docs/ANALYTICS.md.
// Super properties: product=superhumanisdead, surface=landing (the website is all marketing + sign-in; the product is
// the desktop app), platform=web. Page views are PostHog's $pageview. Autocapture and session replay are off.
// Never send user content (emails, text, URLs) as properties: kinds, counts and enums only.
type PH = typeof import('posthog-js').default
type Props = Record<string, string | number | boolean | null | undefined>

export const APP = 'superhumanisdead' as const
export type Surface = 'landing' | 'app'
export const EVENTS = {
  app_signed_up: 'app_signed_up', // method ("password" | "google")
  app_signed_in: 'app_signed_in', // method ("password" | "google")
  app_signed_out: 'app_signed_out',
  landing_cta_clicked: 'landing_cta_clicked', // target ("signup" | "login" | "pricing" | "github" | "contact"), location
} as const
export type EventName = (typeof EVENTS)[keyof typeof EVENTS]
export const EVENT_PREFIXES = ['app_', 'landing_'] as const
export const superProps = (surface: Surface) => ({ product: APP, surface, platform: 'web' as const })
/** Super properties older IsDead taxonomies (and other apps on this shared origin) persisted in the yourappisdead.com cookie. */
export const LEGACY_PROPS = ['app', 'app_family', 'base_path', 'suite_id', 'app_id', 'schema_version', 'source', 'site_id', 'environment', 'account_type'] as const

const BASE = '/superhumanisdead'
// The Vercel env sets NEXT_PUBLIC_POSTHOG_KEY on every IsDead project; the token is publishable, so it is also the fallback.
const KEY = (import.meta.env.NEXT_PUBLIC_POSTHOG_KEY as string | undefined) || 'phc_nrzr9eEcwg6H89hkh4DmBU4nL9ntSArzQXV2SR2vaE2F'
const UI_HOST = (import.meta.env.NEXT_PUBLIC_POSTHOG_HOST as string | undefined) || 'https://us.posthog.com'
export const surfaceOf = (_pathname: string): Surface => 'landing'

const isLocal = () => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
// Local runs stay silent unless explicitly opted in (the verification script sets isdead_ph_debug=1).
const debugOn = () => { try { return isLocal() && localStorage.getItem('isdead_ph_debug') === '1' } catch { return false } }
export const analyticsEnabled = () => typeof window !== 'undefined' && (!isLocal() || debugOn()) && navigator.doNotTrack !== '1'

let ph: PH | null = null
let loading: Promise<PH | null> | null = null
function client(): Promise<PH | null> {
  if (!analyticsEnabled()) return Promise.resolve(null)
  if (ph) return Promise.resolve(ph)
  loading ??= import('posthog-js').then((m) => {
    const p = m.default
    const debug = debugOn()
    p.init(KEY, {
      // Our own origin (vercel.json rewrites <BASE>/ingest → us.i.posthog.com) so ad blockers don't drop requests.
      api_host: `${location.origin}${BASE}/ingest`, ui_host: UI_HOST,
      capture_pageview: false, capture_pageleave: true, autocapture: false, disable_session_recording: true, capture_heatmaps: false, capture_performance: false,
      persistence: 'localStorage+cookie', person_profiles: 'always', debug, opt_out_useragent_filter: debug,
    })
    // Every IsDead app shares the yourappisdead.com cookie: clear other apps' leftovers, then set ours.
    for (const k of LEGACY_PROPS) p.unregister(k)
    p.register({ ...superProps(surfaceOf(location.pathname)), env: isLocal() ? 'development' : 'production' })
    ph = p
    if (debug) (window as unknown as { __posthog?: PH }).__posthog = p
    return p
  }).catch(() => null)
  return loading
}

/** Fire a taxonomy event; drops silently when analytics is off. */
export function track(event: EventName, props: Props = {}) {
  void client().then((p) => p?.capture(event, { surface: surfaceOf(location.pathname), ...props }))
}
/** Like track, but sent immediately; await it before navigating away. Never throws or waits past 1.5s. */
export async function trackNow(event: EventName, props: Props = {}) {
  await Promise.race([
    client().then((p) => { p?.capture(event, { surface: surfaceOf(location.pathname), ...props }, { send_instantly: true }) }).catch(() => {}),
    new Promise((r) => setTimeout(r, 1500)),
  ])
}
/** Signed-in users are identified by Firebase uid (shared across the IsDead family). */
export function identify(uid: string) { void client().then((p) => p?.identify(uid, { account_type: 'firebase' })) }
/** reset() wipes super properties too, so put ours back straight away. */
export function resetIdentity() { void client().then((p) => { p?.reset(); p?.register(superProps(surfaceOf(location.pathname))) }) }

const ctaTarget = (a: HTMLAnchorElement): string | null => {
  const href = a.getAttribute('href') ?? ''
  if (/login\/?\?mode=signup|\/signup$/.test(href)) return 'signup'
  if (/login\/?$/.test(href)) return 'login'
  if (/pricing\/?$/.test(href)) return 'pricing'
  if (/github\.com\//.test(href)) return 'github'
  if (/^https:\/\/yourappisdead\.com\/?$/.test(href)) return 'contact'
  return null
}
const where = (a: Element) => a.closest('nav, .shm-nav') ? 'nav' : a.closest('footer') ? 'footer' : a.closest('.sh-banner, .shm-banner') ? 'banner' : 'page'

/** Call once per page: boots the client, sends $pageview, and records marketing CTA clicks. */
export function startAnalytics() {
  if (!analyticsEnabled()) return
  void client().then((p) => p?.capture('$pageview', { $current_url: location.href }))
  document.addEventListener('click', (event) => {
    const a = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null
    const target = a && ctaTarget(a)
    // Sent immediately: these links navigate away straight after the click.
    if (a && target) void trackNow('landing_cta_clicked', { target, location: where(a) })
  }, true)
}
