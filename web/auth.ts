/** Firebase web config comes from env (VITE_FIREBASE_*), never hard-coded. Project: yourappisdead. */
export function firebaseConfig(env: Record<string, string | undefined> = import.meta.env as Record<string, string | undefined>) {
  return {
    apiKey: (env['VITE_FIREBASE_API_KEY'] ?? env['NEXT_PUBLIC_FIREBASE_API_KEY']) ?? '',
    authDomain: (env['VITE_FIREBASE_AUTH_DOMAIN'] ?? env['NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN']) ?? 'yourappisdead.firebaseapp.com',
    projectId: (env['VITE_FIREBASE_PROJECT_ID'] ?? env['NEXT_PUBLIC_FIREBASE_PROJECT_ID']) ?? 'yourappisdead',
    appId: (env['VITE_FIREBASE_APP_ID'] ?? env['NEXT_PUBLIC_FIREBASE_APP_ID']) ?? '',
  }
}

export function authErrorMessage(error: unknown): string {
  const code = (error as { code?: string }).code ?? ''
  const map: Record<string, string> = {
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/invalid-email': 'That email looks wrong.',
    'auth/email-already-in-use': 'That email already has an account. Log in instead.',
    'auth/weak-password': 'Use at least 6 characters.',
    'auth/popup-closed-by-user': 'Google sign-in was closed.',
    'auth/too-many-requests': 'Too many tries. Wait a minute and try again.',
    'auth/network-request-failed': 'Network error. Check your connection.',
  }
  return map[code] ?? 'Something went wrong. Try again.'
}
