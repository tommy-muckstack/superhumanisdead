import { describe, expect, it } from 'vitest'
import { APP, EVENTS, EVENT_PREFIXES, LEGACY_PROPS, scrub, superProps } from './analytics'

describe('web analytics taxonomy', () => {
  it('uses app_/landing_ snake_case names without the product name', () => {
    for (const name of Object.values(EVENTS)) {
      expect(EVENT_PREFIXES.some((p) => name.startsWith(p))).toBe(true)
      expect(name).toMatch(/^[a-z]+(_[a-z]+)+$/)
      expect(name).not.toContain('superhuman')
    }
  })
  it('registers the shared super properties and never re-registers a legacy key', () => {
    expect(superProps('landing')).toEqual({ product: APP, surface: 'landing', platform: 'web' })
    expect(APP).toBe('superhumanisdead')
    for (const k of LEGACY_PROPS) expect(Object.keys(superProps('landing'))).not.toContain(k)
  })
  it('scrubs query strings, hashes and the page title before sending', () => {
    const e = scrub({ properties: { $current_url: 'https://yourappisdead.com/superhumanisdead/login/?mode=signup#x', $referrer: '$direct', title: 'Log in', target: 'signup' }, $set_once: { $initial_current_url: 'https://a.test/p?q=1', $session_entry_url: 'https://a.test/e?x=1', $initial_pathname: '/p?q', $session_entry_pathname: '/s#h' } })
    expect(e.properties).toEqual({ $current_url: 'https://yourappisdead.com/superhumanisdead/login/', $referrer: '$direct', target: 'signup' })
    expect(e.$set_once).toEqual({ $initial_current_url: 'https://a.test/p', $session_entry_url: 'https://a.test/e', $initial_pathname: '/p', $session_entry_pathname: '/s' })
  })
  it('also scrubs person properties nested in properties.$set / $set_once, by key suffix', () => {
    const e = scrub({ properties: { $some_new_url: 'https://a.test/x?y=1', target: 'login', $set: { $current_url: 'https://a.test/p?q=1' }, $set_once: { $initial_current_url: 'https://a.test/i?utm=1', $initial_pathname: '/i?x', $initial_os: 'Mac OS X' } } })
    expect(e.properties).toEqual({ $some_new_url: 'https://a.test/x', target: 'login', $set: { $current_url: 'https://a.test/p' }, $set_once: { $initial_current_url: 'https://a.test/i', $initial_pathname: '/i', $initial_os: 'Mac OS X' } })
  })
})
