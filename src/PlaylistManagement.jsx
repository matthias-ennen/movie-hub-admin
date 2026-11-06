import React, { useCallback, useEffect, useRef, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { OFFER_OPTIONS, playlistLabel, validatePlaylistDraft } from './playlistManagement.js'

const EMPTY = { name: '', url: '', offerKind: 'free', enabled: true }
const PAGE = 25

export default function PlaylistManagement({ functions }) {
  const [items, setItems] = useState([])
  const [revision, setRevision] = useState(0)
  const [cursor, setCursor] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState({ ...EMPTY })
  const [removing, setRemoving] = useState(null)
  const active = useRef(true)
  const current = useRef(0)

  const request = useCallback((data) => httpsCallable(functions, 'manageYoutubePlaylists')(data), [functions])

  const load = useCallback(async (nextCursor = null, knownRevision = null) => {
    const version = ++current.current
    setLoading(true)
    setError('')
    try {
      const result = (await request({ action: 'list', cursor: nextCursor, revision: knownRevision })).data
      if (!active.current || version !== current.current) return
      setRevision(result.revision)
      setItems(previous => nextCursor
        ? [...new Map([...previous, ...result.items].map(row => [row.playlistId, row])).values()]
        : result.items)
      setCursor(result.nextCursor)
    } catch (reason) {
      if (active.current && version === current.current) setError(
        reason.code === 'functions/permission-denied'
          ? 'Für dieses Konto fehlt die Admin-Berechtigung.'
          : reason.code === 'functions/failed-precondition'
            ? 'Die Liste wurde inzwischen verändert. Bitte neu laden.'
            : 'Playlistkonfiguration konnte nicht geladen werden. Bitte Verbindung und Berechtigungen prüfen.')
    } finally {
      if (active.current && version === current.current) setLoading(false)
    }
  }, [request])

  useEffect(() => {
    active.current = true
    load()
    return () => { active.current = false; ++current.current }
  }, [load])

  function beginCreate() {
    setEditing('new'); setDraft({ ...EMPTY }); setError(''); setMessage('')
  }
  function beginEdit(item) {
    setEditing(item.playlistId)
    setDraft({ name: item.name, url: item.url, offerKind: item.offerKind, enabled: item.enabled })
    setError(''); setMessage('')
  }
  async function commit(data, successText) {
    if (busy) return false
    setBusy(true); setError(''); setMessage('')
    try {
      await request({ ...data, expectedRevision: revision })
      if (!active.current) return false
      setEditing(null); setRemoving(null)
      setMessage(successText)
      await load()
      return true
    } catch (reason) {
      if (active.current) {
        setError(reason.message || 'Playlist konnte nicht gespeichert werden.')
        if (reason.code === 'functions/aborted') {
          setError('Zwischenzeitliche Änderung erkannt. Bitte die Liste neu laden und erneut bearbeiten.')
        }
      }
      return false
    } finally { if (active.current) setBusy(false) }
  }
  async function submit(event) {
    event.preventDefault()
    let normalized
    try { normalized = validatePlaylistDraft(draft) }
    catch (reason) { setError(reason.message); return }
    await commit({ action: 'save', playlist: normalized,
      originalPlaylistId: editing === 'new' ? null : editing }, 'Playlist gespeichert.')
  }
  function toggle(item) {
    commit({ action: 'save', originalPlaylistId: item.playlistId,
      playlist: { name: item.name, url: item.url,
        offerKind: item.offerKind, enabled: !item.enabled } },
    item.enabled ? 'Playlist deaktiviert.' : 'Playlist aktiviert.')
  }
  function remove() {
    if (!removing) return
    commit({ action: 'remove', playlistId: removing.playlistId }, 'Playlist entfernt.')
  }

  return <section className="playlist-page" aria-labelledby="youtube-playlists-heading">
    <div className="connection-card">
      <div className="management-heading">
        <h2 id="youtube-playlists-heading">YouTube-Playlisten</h2>
        <button type="button" disabled={loading || busy} className="secondary"
          onClick={() => load()}>Aktualisieren</button>
      </div>
      <p>Hier verwaltest du die YouTube-Playlisten für MovieHub. Du trägst auch die beiden bisherigen Listen selbst ein. Bereits konfigurierte Listen bleiben beim Bearbeiten erhalten.</p>
      <p className="setup-note"><strong>Einrichtung:</strong> Die neue Konfiguration wird zunächst gespeichert, aber noch nicht vom produktiven Nachtlauf benutzt. Der bisherige YouTube-Adapter arbeitet bis zur gemeinsamen Umstellung unverändert weiter. Filme und einzelne Serienfolgen werden vor der Umstellung gesondert geprüft.</p>

      {items.length > 0 && <ul className="playlist-list">{items.map(item => <li key={item.playlistId}>
        <div className="playlist-line">
          <div><h3>{item.name}</h3><span className="playlist-kind">{playlistLabel(item.offerKind)}</span>
            <span className="playlist-status">{item.enabled ? 'Aktiv' : 'Deaktiviert'}</span></div>
        </div>
        <a href={item.url} target="_blank" rel="noreferrer" className="playlist-url">{item.url}</a>
        <div className="playlist-actions">
          <button type="button" disabled={busy || loading} onClick={() => beginEdit(item)}>Bearbeiten</button>
          <button type="button" disabled={busy || loading} className="secondary" onClick={() => toggle(item)}>{item.enabled ? 'Deaktivieren' : 'Aktivieren'}</button>
          <button type="button" disabled={busy || loading} className="secondary" onClick={() => { setRemoving(item); setError('') }}>Entfernen</button>
        </div>
      </li>)}</ul>}
      {loading ? <p role="status">Playlisten werden geladen …</p> :
        items.length === 0 && !error && <p>Noch keine Playlisten eingetragen. Die bisherigen zwei Listen werden nicht automatisch übernommen.</p>}
      {cursor && <button className="secondary" type="button" disabled={busy || loading}
        onClick={() => load(cursor, revision)}>Weitere Playlisten laden</button>}
      {editing === null && <button type="button" disabled={busy || loading}
        onClick={beginCreate}>Playlist hinzufügen</button>}

      {editing !== null && <form className="playlist-editor" onSubmit={submit}>
        <h3>{editing === 'new' ? 'Playlist hinzufügen' : 'Playlist bearbeiten'}</h3>
        <div className="playlist-fields">
          <label>Name<input type="text" maxLength={100} required value={draft.name}
            onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
          <label>YouTube-Playlist-Link<input type="url" required value={draft.url} disabled={editing !== 'new'}
            placeholder="https://www.youtube.com/playlist?list=..."
            onChange={event => setDraft({ ...draft, url: event.target.value })} /></label>
        </div>
        <label>Angebotsart<select value={draft.offerKind}
          onChange={event => setDraft({ ...draft, offerKind: event.target.value })}>
          {OFFER_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select></label>
        <label className="playlist-check"><input type="checkbox" checked={draft.enabled}
          onChange={event => setDraft({ ...draft, enabled: event.target.checked })} /> Playlist aktiv</label>
        <div className="playlist-actions">
          <button type="submit" disabled={busy}>{busy ? 'Speichere …' : 'Speichern'}</button>
          <button type="button" className="secondary" disabled={busy}
            onClick={() => { setEditing(null); setError('') }}>Abbrechen</button>
        </div>
      </form>}
      {error && <p role="alert" className="error">{error}</p>}
      {message && <p role="status" className="success">{message}</p>}
    </div>
    {removing && <div className="confirmation-backdrop">
      <section className="confirmation-panel" role="dialog" aria-modal="true" aria-labelledby="remove-playlist-heading">
        <h2 id="remove-playlist-heading">Playlist wirklich entfernen?</h2>
        <p><strong>{removing.name}</strong></p>
        <p>Die Playlist wird aus der Admin-Konfiguration entfernt. Andere Playlisten bleiben unverändert.</p>
        <div className="confirmation-actions">
          <button type="button" className="secondary" disabled={busy}
            onClick={() => setRemoving(null)}>Abbrechen</button>
          <button type="button" disabled={busy} onClick={remove}>{busy ? 'Entferne …' : 'Jetzt entfernen'}</button>
        </div>
      </section>
    </div>}
  </section>
}
