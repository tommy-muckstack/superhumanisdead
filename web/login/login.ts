import { initializeApp } from 'firebase/app'
import { createUserWithEmailAndPassword, getAuth, GoogleAuthProvider, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth'
import { firebaseConfig, authErrorMessage } from '../auth'

// Shared YourAppIsDead auth (Firebase project "yourappisdead").
const auth = getAuth(initializeApp(firebaseConfig()))
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const form = $<HTMLFormElement>('form')
const msg = $('msg')
let signup = new URLSearchParams(location.search).get('mode') === 'signup'
const next = new URLSearchParams(location.search).get('next') ?? '../'

function render() {
  $('title').textContent = signup ? 'Create your account' : 'Log in'
  $('submit').textContent = signup ? 'Create account' : 'Log in'
  $('switchText').textContent = signup ? 'Have an account?' : 'New here?'
  $('switch').textContent = signup ? 'Log in' : 'Create an account'
  $<HTMLInputElement>('password').autocomplete = signup ? 'new-password' : 'current-password'
}
const say = (text: string, ok = false) => { msg.textContent = text; msg.className = ok ? 'msg ok' : 'msg' }

$('switch').onclick = () => { signup = !signup; render(); say('') }
$('google').onclick = () => signInWithPopup(auth, new GoogleAuthProvider()).catch((e) => say(authErrorMessage(e)))
$('reset').onclick = async () => {
  const email = $<HTMLInputElement>('email').value.trim()
  if (!email) return say('Enter your email first.')
  try { await sendPasswordResetEmail(auth, email); say('Check your inbox for a reset link.', true) } catch (e) { say(authErrorMessage(e)) }
}
form.onsubmit = async (event) => {
  event.preventDefault()
  const email = $<HTMLInputElement>('email').value.trim()
  const password = $<HTMLInputElement>('password').value
  try {
    if (signup) await createUserWithEmailAndPassword(auth, email, password)
    else await signInWithEmailAndPassword(auth, email, password)
  } catch (e) { say(authErrorMessage(e)) }
}
onAuthStateChanged(auth, (user) => { if (user) { say(`Signed in as ${user.email}`, true); location.href = next } })
render()
