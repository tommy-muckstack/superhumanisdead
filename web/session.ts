import { initializeApp } from 'firebase/app'
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth'
import { firebaseConfig } from './auth'

// Signed-in state for the static site: a small account menu (with Sign out) on every page.
// A marker cookie (sh_session) mirrors the Firebase state so other tools can see it; it holds no secret.
const auth = getAuth(initializeApp(firebaseConfig()))
const BASE = '/superhumanisdead/'
const setMarker = (on: boolean) => { document.cookie = `sh_session=${on ? '1' : ''}; path=/; max-age=${on ? 2592000 : 0}; samesite=lax` }
let root: HTMLElement | null = null

function mount(email: string) {
  if (root) return
  document.body.classList.add('sh-authed')
  root = document.createElement('div')
  root.className = 'sh-acct'
  root.innerHTML = `<button type="button" class="sh-avatar" aria-label="Account menu" aria-haspopup="true" aria-expanded="false"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.5-6.5 8-6.5s7 2 8 6.5"/></svg></button><div class="sh-menu" hidden><div class="sh-menu-email"></div><button type="button" class="sh-menu-out">Sign out</button></div>`
  root.querySelector('.sh-menu-email')!.textContent = email
  const btn = root.querySelector<HTMLButtonElement>('.sh-avatar')!
  const menu = root.querySelector<HTMLElement>('.sh-menu')!
  btn.onclick = () => { menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden)) }
  root.querySelector<HTMLButtonElement>('.sh-menu-out')!.onclick = async () => {
    await signOut(auth).catch(() => {})
    setMarker(false)
    location.href = BASE
  }
  document.body.appendChild(root)
}

onAuthStateChanged(auth, (user) => {
  if (user) { setMarker(true); mount(user.email ?? 'Signed in') }
  else { setMarker(false); root?.remove(); root = null; document.body.classList.remove('sh-authed') }
})
