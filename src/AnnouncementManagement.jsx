import React, { useCallback, useEffect, useRef, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { announcementStatus, displayDate } from './announcementManagement.js'

function WithdrawConfirmation({ item, busy, error, onCancel, onConfirm }) {
  const dialog = useRef(null)
  useEffect(() => {
    const element = dialog.current
    element.showModal()
    return () => element.close()
  }, [])
  return <dialog ref={dialog} className="confirmation-panel" aria-labelledby="withdraw-title"
    onCancel={(event) => { event.preventDefault(); if (!busy) onCancel() }}>
    <h2 id="withdraw-title">Mitteilung zurückziehen?</h2>
    <p><strong>{item.title}</strong></p>
    <p>Die Mitteilung verschwindet für alle Nutzer aus Startfenster, Glockenzähler und Posteingang. Sie kann danach nicht erneut veröffentlicht werden.</p>
    <p>Anzeige: {item.mode === 'startup' ? 'Startfenster und Posteingang' : 'nur Posteingang'}</p>
    <p>Gültig bis: {displayDate(item.expiresAt)}</p>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="confirmation-actions">
      <button type="button" autoFocus disabled={busy} onClick={onCancel}>Abbrechen</button>
      <button type="button" disabled={busy} onClick={onConfirm}>{busy ? 'Wird zurückgezogen …' : 'Jetzt zurückziehen'}</button>
    </div>
  </dialog>
}

export default function AnnouncementManagement({ functions, refreshKey }) {
  const [items, setItems] = useState([])
  const [cursor, setCursor] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [result, setResult] = useState('')
  const [pending, setPending] = useState(null)
  const [withdrawing, setWithdrawing] = useState(false)
  const [now, setNow] = useState(Date.now())
  const generation = useRef(0)
  const mounted = useRef(false)
  const busy = useRef(false)
  const listHeading = useRef(null)
  const restoreFocus = useRef(false)

  const load = useCallback(async (nextCursor = null) => {
    const revision = ++generation.current
    setLoading(true)
    setError('')
    try {
      const response = await httpsCallable(functions, 'publishAnnouncement')({ action: 'list', cursor: nextCursor })
      if (generation.current !== revision) return
      setItems((previous) => nextCursor
        ? [...new Map([...previous, ...response.data.items].map((item) => [item.id, item])).values()]
        : response.data.items)
      setCursor(response.data.nextCursor)
      setNow(Date.now())
    } catch (failure) {
      if (generation.current === revision) setError(failure.code === 'functions/permission-denied'
        ? 'Für dieses Konto fehlt die Admin-Berechtigung.' : 'Mitteilungen konnten nicht geladen werden. Bitte erneut versuchen.')
    } finally { if (generation.current === revision) setLoading(false) }
  }, [functions])

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    load()
    const clock = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => { generation.current++; window.clearInterval(clock) }
  }, [load, refreshKey])

  useEffect(() => {
    if (!pending && restoreFocus.current) {
      listHeading.current?.focus()
      restoreFocus.current = false
    }
  }, [pending])

  async function withdraw() {
    if (!pending || busy.current) return
    busy.current = true
    setWithdrawing(true)
    setError('')
    try {
      await httpsCallable(functions, 'publishAnnouncement')({ action: 'withdraw', id: pending.id })
      if (!mounted.current) return
      setItems((previous) => previous.map((item) => item.id === pending.id ? { ...item, status: 'withdrawn' } : item))
      setResult(`„${pending.title}“ wurde zurückgezogen.`)
      restoreFocus.current = true
      setPending(null)
      await load()
    } catch (failure) {
      if (mounted.current) setError(failure.code === 'functions/permission-denied'
        ? 'Für dieses Konto fehlt die Admin-Berechtigung.'
        : failure.code === 'functions/failed-precondition' ? failure.message
          : 'Mitteilung konnte nicht zurückgezogen werden. Bitte erneut versuchen.')
    } finally {
      busy.current = false
      if (mounted.current) setWithdrawing(false)
    }
  }

  return <section className="announcement-management" aria-labelledby="management-heading">
    <div className="management-heading">
      <h2 id="management-heading" ref={listHeading} tabIndex={-1}>Veröffentlichte Mitteilungen</h2>
      <button type="button" className="secondary" disabled={loading || withdrawing} onClick={() => { setResult(''); load() }}>Aktualisieren</button>
    </div>
    <p>Noch gültige und geplante Mitteilungen. Zurückgezogene Einträge bleiben hier bis zum ursprünglichen Ablauf sichtbar.</p>
    {items.length > 0 && <ul className="announcement-list">{items.map((item) => <li key={item.id}>
      <div className="announcement-heading"><h3>{item.title}</h3><span className="announcement-status">{announcementStatus(item, now)}</span></div>
      <p className="announcement-body">{item.body}</p>
      <dl>
        <div><dt>Anzeige</dt><dd>{item.mode === 'startup' ? 'Startfenster und Posteingang' : 'Nur Posteingang'}</dd></div>
        <div><dt>Gültig ab</dt><dd>{displayDate(item.startsAt)}</dd></div>
        <div><dt>Gültig bis</dt><dd>{displayDate(item.expiresAt)}</dd></div>
        {item.createdAt && <div><dt>Veröffentlicht</dt><dd>{displayDate(item.createdAt)}</dd></div>}
        {item.withdrawnAt && <div><dt>Zurückgezogen</dt><dd>{displayDate(item.withdrawnAt)}</dd></div>}
      </dl>
      {item.status === 'published' && item.expiresAt > now && <button type="button" disabled={loading || withdrawing}
        aria-label={`„${item.title}“ zurückziehen`} onClick={() => { setPending(item); setError(''); setResult('') }}>Zurückziehen</button>}
    </li>)}</ul>}
    {loading ? <p role="status">Mitteilungen werden geladen …</p>
      : items.length === 0 && !error && <p>Keine noch gültigen oder geplanten Mitteilungen.</p>}
    {error && !pending && <p className="error" role="alert">{error}</p>}
    {result && <p className="success" role="status">{result}</p>}
    {cursor && <button type="button" className="secondary" disabled={loading || withdrawing} onClick={() => load(cursor)}>Weitere laden</button>}
    {pending && <WithdrawConfirmation item={pending} busy={withdrawing} error={error}
      onCancel={() => { setPending(null); setError('') }} onConfirm={withdraw} />}
  </section>
}
