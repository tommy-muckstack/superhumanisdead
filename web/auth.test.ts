import { describe, expect, it } from 'vitest'
import { authErrorMessage, firebaseConfig } from './auth'
describe('web auth', () => {
  it('defaults to the yourappisdead project', () => {
    expect(firebaseConfig({}).projectId).toBe('yourappisdead')
    expect(firebaseConfig({ VITE_FIREBASE_API_KEY: 'k' }).apiKey).toBe('k')
  })
  it('maps firebase errors', () => {
    expect(authErrorMessage({ code: 'auth/invalid-credential' })).toBe('Wrong email or password.')
    expect(authErrorMessage(new Error('x'))).toContain('Something went wrong')
  })
})
