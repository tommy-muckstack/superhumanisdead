import { useEffect, useState } from 'react'
import type { Settings } from '@shared/types'

interface Props {
  settings: Settings
  signedIn: boolean
  email: string
  modal?: boolean
  onSave: (patch: Partial<Settings>) => Promise<void>
  onSignIn: () => Promise<void>
  onSignOut: () => Promise<void>
  onClose?: () => void
  onDemo?: () => void
}

export function Setup({ settings, signedIn, email, modal, onSave, onSignIn, onSignOut, onClose, onDemo }: Props) {
  const [form, setForm] = useState(settings)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setForm(settings), [settings])

  const update = (key: keyof Settings) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((previous) => ({ ...previous, [key]: event.target.value }))

  const save = async (): Promise<boolean> => {
    setError(null)
    try {
      await onSave(form)
      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      return false
    }
  }

  const connect = async () => {
    setBusy(true)
    if (await save()) {
      try {
        await onSignIn()
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught))
      }
    }
    setBusy(false)
  }

  const card = (
    <div className="card" onKeyDown={(event) => event.stopPropagation()}>
      <div className="brand">DuperHuman</div>
      <div className="sub">{signedIn ? `Signed in as ${email}` : 'Your inbox, your keys, no server.'}</div>

      <label>Google OAuth client ID</label>
      <input value={form.googleClientId} onChange={update('googleClientId')} placeholder="xxxx.apps.googleusercontent.com" spellCheck={false} />
      <label>Google OAuth client secret (Desktop clients include one; it is not secret)</label>
      <input value={form.googleClientSecret} onChange={update('googleClientSecret')} type="password" spellCheck={false} />
      <label>Anthropic API key (for summaries, drafts and AI triage)</label>
      <input value={form.anthropicApiKey} onChange={update('anthropicApiKey')} type="password" placeholder="sk-ant-…" spellCheck={false} />
      <label>Signature (optional, appended to new mail)</label>
      <input value={form.signature} onChange={update('signature')} placeholder="— Tommy" />

      {error && <div className="error">{error}</div>}

      <div className="actions">
        {signedIn ? (
          <>
            <button className="btn primary" disabled={busy} onClick={() => void save().then((ok) => ok && onClose?.())}>Save</button>
            <button className="btn ghost" disabled={busy} onClick={() => void onSignOut()}>Sign out</button>
          </>
        ) : (
          <button className="btn primary" disabled={busy || !form.googleClientId} onClick={() => void connect()}>
            {busy ? 'Waiting for Google…' : 'Save and sign in with Google'}
          </button>
        )}
        {modal && <button className="btn ghost" onClick={onClose}>Close</button>}
        {!signedIn && onDemo && <button className="btn ghost" onClick={onDemo}>Try the sample inbox</button>}
        {busy && <span className="spinner" />}
      </div>

      {!signedIn && (
        <div className="help">
          One-time setup, about two minutes:
          <br />1. In Google Cloud Console, enable the <code>Gmail API</code> for a project.
          <br />2. OAuth consent screen: External, add yourself as a test user, add the scope <code>gmail.modify</code>.
          <br />3. Credentials → Create OAuth client ID → <code>Desktop app</code>. Paste the ID and secret here.
          <br />Tokens stay on this Mac, encrypted by the system keychain.
        </div>
      )}
    </div>
  )

  if (modal) {
    return (
      <div className="scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
        <div className="setup" style={{ background: 'none', height: 'auto' }}>{card}</div>
      </div>
    )
  }
  return <div className="setup">{card}</div>
}
