import { initializeApp } from 'firebase/app'
import { createUserWithEmailAndPassword, getAdditionalUserInfo, getAuth, GoogleAuthProvider, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, type User } from 'firebase/auth'
import { firebaseConfig, authErrorMessage } from '../auth'
import { identify, startAnalytics, trackNow } from '../analytics'

startAnalytics()

// Shared YourAppIsDead auth (Firebase project "yourappisdead").
const auth = getAuth(initializeApp(firebaseConfig()))
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const form = $<HTMLFormElement>('form')
const msg = $('msg')
let signup = new URLSearchParams(location.search).get('mode') === 'signup'
const rawNext = new URLSearchParams(location.search).get('next') ?? ''
const next = /^\/(?!\/)/.test(rawNext) ? rawNext : '/superhumanisdead/'

function render() {
  $('title').textContent = signup ? 'Create your account' : 'Log in'
  $('submit').textContent = signup ? 'Create account' : 'Log in'
  $('switchText').textContent = signup ? 'Have an account?' : 'New here?'
  $('switch').textContent = signup ? 'Log in' : 'Create an account'
  $<HTMLInputElement>('password').autocomplete = signup ? 'new-password' : 'current-password'
}
const say = (text: string, ok = false) => { msg.textContent = text; msg.className = ok ? 'msg ok' : 'msg' }

$('switch').onclick = () => { signup = !signup; render(); say('') }
// While a sign-in started on this page is in flight, its handler (not onAuthStateChanged) records the event and redirects.
let signingIn = false
function go(user: User) { document.cookie = 'sh_session=1; path=/; max-age=2592000; samesite=lax'; say(`Signed in as ${user.email}`, true); location.href = next }
async function finish(user: User, method: 'password' | 'google', created: boolean) {
  identify(user.uid)
  await trackNow(created ? 'app_signed_up' : 'app_signed_in', { method })
  go(user)
}
$('google').onclick = async () => {
  signingIn = true
  try { const result = await signInWithPopup(auth, new GoogleAuthProvider()); await finish(result.user, 'google', Boolean(getAdditionalUserInfo(result)?.isNewUser)) }
  catch (e) { say(authErrorMessage(e)) }
  finally { signingIn = false }
}
$('reset').onclick = async () => {
  const email = $<HTMLInputElement>('email').value.trim()
  if (!email) return say('Enter your email first.')
  try { await sendPasswordResetEmail(auth, email); say('Check your inbox for a reset link.', true) } catch (e) { say(authErrorMessage(e)) }
}
form.onsubmit = async (event) => {
  event.preventDefault()
  const email = $<HTMLInputElement>('email').value.trim()
  const password = $<HTMLInputElement>('password').value
  signingIn = true
  try {
    const created = signup
    const cred = created ? await createUserWithEmailAndPassword(auth, email, password) : await signInWithEmailAndPassword(auth, email, password)
    await finish(cred.user, 'password', created)
  } catch (e) { say(authErrorMessage(e)) }
  finally { signingIn = false }
}
// Already signed in (returning visitor): just continue; no sign-in event.
onAuthStateChanged(auth, (user) => { if (user && !signingIn) go(user) })
render()
$('start').onclick = () => { form.hidden = false; $('start').hidden = true; $<HTMLInputElement>('email').focus() }
if (new URLSearchParams(location.search).get('mode')) { form.hidden = false; $('start').hidden = true }
