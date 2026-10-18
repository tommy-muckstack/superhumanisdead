import { describe, expect, it } from 'vitest'
import { APP, EVENTS, EVENT_PREFIXES, LEGACY_PROPS, superProps } from './analytics'

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
})
