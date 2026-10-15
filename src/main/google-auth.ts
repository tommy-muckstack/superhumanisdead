import { createServer, type Server } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { shell } from 'electron'
import type { Store, Tokens } from './store'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPES = ['https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/calendar.events'].join(' ')

const SUCCESS_PAGE = `<!doctype html><meta charset="utf-8"><title>SuperhumanIsDead</title>
<body style="font-family:-apple-system,Helvetica,sans-serif;background:#141210;color:#f3ede4;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><h1 style="font-weight:600">Signed in</h1><p style="opacity:.7">You can close this tab and go back to SuperhumanIsDead.</p></div></body>`

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  error?: string
  error_description?: string
}

export class GoogleAuth {
  private refreshing = new Map<string, Promise<string>>()

  constructor(private readonly store: Store) {}

  get signedIn(): boolean {
    return this.store.tokens !== null
  }

  get email(): string {
    return this.store.tokens?.email ?? ''
  }

  get emails(): string[] {
    return this.store.accounts.map((entry) => entry.email)
  }

  switchTo(email: string): void {
    this.store.setActive(email)
  }

  async signIn(): Promise<Tokens> {
    const { googleClientId, googleClientSecret } = this.store.settings
    if (!googleClientId) throw new Error('Add a Google OAuth client ID in Settings first.')

    const verifier = base64Url(randomBytes(32))
    const challenge = base64Url(createHash('sha256').update(verifier).digest())
    const state = base64Url(randomBytes(16))

    const { server, port, code } = await this.listenForCode(state)
    const redirectUri = `http://127.0.0.1:${port}/callback`
    const url = new URL(AUTH_URL)
    url.search = new URLSearchParams({
      client_id: googleClientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
    }).toString()
    await shell.openExternal(url.toString())

    let authCode: string
    try {
      authCode = await code
    } finally {
      server.close()
    }

    const body = new URLSearchParams({
      client_id: googleClientId,
      code: authCode,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    })
    if (googleClientSecret) body.set('client_secret', googleClientSecret)
    const token = await this.postToken(body)
    if (!token.refresh_token) throw new Error('Google did not return a refresh token. Remove SuperhumanIsDead from your Google account permissions and sign in again.')
    const email = await this.fetchEmail(token.access_token)
    const tokens: Tokens = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + token.expires_in * 1000 - 60_000,
      email,
    }
    this.store.upsertTokens(tokens, true)
    return tokens
  }

  /** Sign out the active account only. */
  async signOut(): Promise<void> {
    const tokens = this.store.tokens
    if (tokens) this.store.removeAccount(tokens.email)
    if (!tokens) return
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokens.refreshToken)}`, { method: 'POST' })
    } catch (error) {
      console.warn('[auth] revoke failed', error)
    }
  }

  async accessToken(email?: string): Promise<string> {
    const tokens = email ? this.store.tokensFor(email) : this.store.tokens
    if (!tokens) throw new Error('Not signed in')
    if (Date.now() < tokens.expiresAt) return tokens.accessToken
    const pending = this.refreshing.get(tokens.email)
    if (pending) return pending
    const promise = this.refresh(tokens).finally(() => this.refreshing.delete(tokens.email))
    this.refreshing.set(tokens.email, promise)
    return promise
  }

  private async refresh(tokens: Tokens): Promise<string> {
    const { googleClientId, googleClientSecret } = this.store.settings
    const body = new URLSearchParams({
      client_id: googleClientId,
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
    })
    if (googleClientSecret) body.set('client_secret', googleClientSecret)
    const token = await this.postToken(body)
    const next: Tokens = {
      ...tokens,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? tokens.refreshToken,
      expiresAt: Date.now() + token.expires_in * 1000 - 60_000,
    }
    this.store.upsertTokens(next)
    return next.accessToken
  }

  private async postToken(body: URLSearchParams): Promise<TokenResponse> {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    const json = (await response.json()) as TokenResponse
    if (!response.ok || json.error) {
      if (json.error === 'invalid_grant' && this.store.tokens) this.store.removeAccount(this.store.tokens.email)
      throw new Error(`Google sign-in failed: ${json.error_description ?? json.error ?? response.status}`)
    }
    return json
  }

  private async fetchEmail(accessToken: string): Promise<string> {
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!response.ok) throw new Error(`Could not read Gmail profile (${response.status})`)
    const json = (await response.json()) as { emailAddress: string }
    return json.emailAddress
  }

  private listenForCode(expectedState: string): Promise<{ server: Server; port: number; code: Promise<string> }> {
    return new Promise((resolveListen, rejectListen) => {
      let resolveCode: (code: string) => void = () => {}
      let rejectCode: (error: Error) => void = () => {}
      const code = new Promise<string>((resolve, reject) => {
        resolveCode = resolve
        rejectCode = reject
      })
      const server = createServer((request, response) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1')
        if (url.pathname !== '/callback') {
          response.writeHead(404).end()
          return
        }
        const error = url.searchParams.get('error')
        const returnedState = url.searchParams.get('state')
        const authCode = url.searchParams.get('code')
        if (error || !authCode || returnedState !== expectedState) {
          response.writeHead(400, { 'Content-Type': 'text/plain' }).end(`Sign-in failed: ${error ?? 'bad response'}`)
          rejectCode(new Error(`Sign-in failed: ${error ?? 'bad response from Google'}`))
          return
        }
        response.writeHead(200, { 'Content-Type': 'text/html' }).end(SUCCESS_PAGE)
        resolveCode(authCode)
      })
      server.on('error', rejectListen)
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (!address || typeof address === 'string') {
          rejectListen(new Error('Could not open the sign-in callback port'))
          return
        }
        const timeout = setTimeout(() => rejectCode(new Error('Sign-in timed out')), 5 * 60_000)
        code.finally(() => clearTimeout(timeout)).catch(() => {})
        resolveListen({ server, port: address.port, code })
      })
    })
  }
}
