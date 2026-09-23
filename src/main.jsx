import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { initializeApp } from 'firebase/app'
import { getAuth, onAuthStateChanged, sendEmailVerification, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { getFunctions, httpsCallable } from 'firebase/functions'
import './style.css'

const envConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}
async function loadFirebaseConfig() {
  let config = envConfig
  if (!Object.values(envConfig).every(Boolean)) {
    const response = await fetch('/__/firebase/init.json', { cache: 'no-store' })
    if (!response.ok) throw new Error('Firebase-Konfiguration konnte nicht geladen werden. Lokal bitte .env.local einrichten.')
    config = await response.json()
  }
  if (!['apiKey', 'authDomain', 'projectId', 'appId'].every((key) => Boolean(config[key]))) {
    throw new Error('Firebase-Konfiguration ist unvollständig.')
  }
  if (config.projectId !== 'movie-hub-62459') throw new Error('Admin-App ist mit einem anderen Firebase-Projekt verbunden.')
  return config
}

function localDate(days = 0) {
  const date = new Date(Date.now() + days * 86400000)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function App() {
  const [user, setUser] = useState(null)
  const [services, setServices] = useState(null)
  const [checking, setChecking] = useState(true)
  const [allowed, setAllowed] = useState(false)
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState('')
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [form, setForm] = useState({ title: '', body: '', mode: 'inbox', startsAt: localDate(), expiresAt: localDate(7) })

  useEffect(() => {
    let active = true
    let unsubscribe = null
    loadFirebaseConfig().then((config) => {
      if (!active) return
      const app = initializeApp(config)
      const auth = getAuth(app)
      const functions = getFunctions(app, import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'europe-west1')
      setServices({ auth, functions })
      unsubscribe = onAuthStateChanged(auth, async (current) => {
      if (!active) return
      setUser(current)
      setAllowed(false)
      setVerified(Boolean(current?.emailVerified))
      setChecking(true)
      try {
        if (current) {
          const hasClaim = (await current.getIdTokenResult(true)).claims.movieHubAdmin === true
          if (active) setAllowed(current.emailVerified && hasClaim)
        }
      } catch { if (active) setError('Berechtigung konnte nicht geprüft werden.') }
      finally { if (active) setChecking(false) }
      })
    }).catch((failure) => { if (active) { setError(failure.message); setChecking(false) } })
    return () => { active = false; unsubscribe?.() }
  }, [])

  async function login(event) {
    event.preventDefault()
    setError('')
    try { await signInWithEmailAndPassword(services.auth, email, password); setPassword('') }
    catch { setError('Anmeldung fehlgeschlagen. Bitte Zugangsdaten prüfen.') }
  }

  async function requestVerification() {
    setBusy(true)
    setError('')
    setResult('')
    try {
      await sendEmailVerification(user)
      setResult(`Bestätigungs-E-Mail an ${user.email} gesendet. Bitte auch den Spam-Ordner prüfen.`)
    } catch {
      setError('Die Bestätigungs-E-Mail konnte nicht gesendet werden. Bitte später erneut versuchen.')
    } finally { setBusy(false) }
  }

  async function checkVerification() {
    setBusy(true)
    setError('')
    setResult('')
    try {
      await user.reload()
      setVerified(user.emailVerified)
      if (user.emailVerified) {
        setAllowed((await user.getIdTokenResult(true)).claims.movieHubAdmin === true)
        setResult('E-Mail-Adresse bestätigt. Die Admin-Berechtigung wurde erneut geprüft.')
      } else {
        setError('Die E-Mail-Adresse ist noch nicht bestätigt. Bitte den Link in der E-Mail öffnen.')
      }
    } catch {
      setError('Der Bestätigungsstatus konnte nicht geprüft werden. Bitte erneut versuchen.')
    } finally { setBusy(false) }
  }

  async function publish(event) {
    event.preventDefault()
    if (busy) return
    if (!window.confirm(`Mitteilung „${form.title.trim()}“ für alle Nutzer veröffentlichen?\n\nAnzeige: ${form.mode === 'startup' ? 'Startfenster und Posteingang' : 'nur Posteingang'}\nGültig bis: ${new Date(form.expiresAt).toLocaleString('de-DE')}`)) return
    setBusy(true)
    setError('')
    setResult('')
    try {
      const payload = {
        title: form.title,
        body: form.body,
        mode: form.mode,
        startsAt: new Date(form.startsAt).toISOString(),
        expiresAt: new Date(form.expiresAt).toISOString(),
      }
      const response = await httpsCallable(services.functions, 'publishAnnouncement')(payload)
      setResult(`Mitteilung veröffentlicht (ID: ${response.data.id}).`)
      setForm((previous) => ({ ...previous, title: '', body: '' }))
    } catch (failure) {
      setError(failure.code === 'functions/permission-denied'
        ? 'Für dieses Konto fehlt die Admin-Berechtigung.'
        : failure.message || 'Mitteilung konnte nicht veröffentlicht werden.')
    } finally { setBusy(false) }
  }

  return <main>
    <header><h1>Movie Hub Admin</h1>{user && <button type="button" onClick={() => signOut(services.auth)}>Abmelden</button>}</header>
    {checking ? <p>Berechtigung wird geprüft …</p> : !services ? null : !user ? <form onSubmit={login}>
      <h2>Anmelden</h2>
      <label>E-Mail<input required type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>Passwort<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <button type="submit">Anmelden</button>
    </form> : !verified ? <section>
      <h2>E-Mail-Adresse bestätigen</h2>
      <p>Für die Admin-Berechtigung muss die E-Mail-Adresse {user.email} bestätigt sein.</p>
      <button type="button" disabled={busy} onClick={requestVerification}>Bestätigungs-E-Mail senden</button>{' '}
      <button type="button" disabled={busy} onClick={checkVerification}>Ich habe die E-Mail bestätigt</button>
    </section> : !allowed ? <p>Dieses Konto hat noch keine Admin-Berechtigung.</p> : <>
      <nav aria-label="Admin-Bereiche"><strong>Mitteilungen</strong></nav>
      <form onSubmit={publish}>
        <h2>Mitteilung veröffentlichen</h2>
        <label>Titel<input required maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
        <label>Nachricht<textarea required rows={8} maxLength={4000} value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} /></label>
        <fieldset><legend>Anzeige</legend>
          <label><input type="radio" name="mode" checked={form.mode === 'inbox'} onChange={() => setForm({ ...form, mode: 'inbox' })} /> Nur Posteingang</label>
          <label><input type="radio" name="mode" checked={form.mode === 'startup'} onChange={() => setForm({ ...form, mode: 'startup' })} /> Beim Start und im Posteingang</label>
        </fieldset>
        <div className="dates">
          <label>Gültig ab<input required type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} /></label>
          <label>Gültig bis<input required type="datetime-local" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} /></label>
        </div>
        <p>Die Zeiten gelten in deiner lokalen Zeitzone. Abgelaufene Mitteilungen werden in Movie Hub nicht mehr angezeigt.</p>
        <button type="submit" disabled={busy}>{busy ? 'Wird veröffentlicht …' : 'Veröffentlichen'}</button>
      </form>
    </>}
    {error && <p className="error" role="alert">{error}</p>}
    {result && <p className="success" role="status">{result}</p>}
  </main>
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
