'use strict'
const { normalizePlaylist, validRevision } = require('./playlistValidation')

const PAGE_SIZE = 25
const ID = /^(?:PL|UU|OLAK5uy_)[A-Za-z0-9_-]{10,120}$/

function createPlaylistHandler({ getDb, FieldPath, FieldValue, HttpsError }) {
  return async function handlePlaylistRequest(request) {
    if (!request.auth || request.auth.token?.movieHubAdmin !== true
      || request.auth.token?.email_verified !== true) {
      throw new HttpsError('permission-denied', 'Nur bestätigte MovieHub-Administratoren dürfen Playlisten verwalten.')
    }
    const input = request.data
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new HttpsError('invalid-argument', 'Ungültige Anfrage.')
    }
    const db = getDb()
    const config = db.collection('adapterConfigs').doc('youtube')
    const playlists = config.collection('playlists')
    const action = input.action

    if (action === 'list') {
      if (input.cursor != null && (typeof input.cursor !== 'string' || !ID.test(input.cursor))) {
        throw new HttpsError('invalid-argument', 'Ungültige Listenseite.')
      }
      const meta = await config.get()
      const revision = meta.exists ? meta.data()?.revision : 0
      if (!validRevision(revision)) throw new HttpsError('failed-precondition', 'Playlist-Revision ungültig.')
      if (input.cursor && input.revision !== revision) {
        throw new HttpsError('failed-precondition', 'Die Playlistliste wurde geändert. Bitte aktualisieren.')
      }
      let query = playlists.orderBy(FieldPath.documentId()).limit(PAGE_SIZE + 1)
      if (input.cursor) query = query.startAfter(input.cursor)
      const snapshot = await query.get()
      const docs = snapshot.docs.slice(0, PAGE_SIZE)
      const items = docs.map(doc => ({ ...doc.data(), playlistId: doc.id }))
        .filter(row => row.schemaVersion === 1 && ID.test(row.playlistId)
          && typeof row.name === 'string' && typeof row.offerKind === 'string'
          && Array.isArray(row.offerTypes) && typeof row.enabled === 'boolean')
        .map(row => ({
          playlistId: row.playlistId, name: row.name, url: row.url,
          offerKind: row.offerKind, offerTypes: row.offerTypes, enabled: row.enabled,
        }))
      return { items, revision, pipelineMode: 'legacy',
        nextCursor: snapshot.size > PAGE_SIZE ? docs.at(-1).id : null }
    }

    if (action !== 'save' && action !== 'remove') {
      throw new HttpsError('invalid-argument', 'Unbekannte Playlist-Aktion.')
    }
    if (!validRevision(input.expectedRevision)) {
      throw new HttpsError('invalid-argument', 'Playlist-Revision fehlt.')
    }
    const id = action === 'remove' ? input.playlistId : input.playlist?.url ?? input.playlist?.playlistId
    let record = null
    if (action === 'save') {
      try { record = normalizePlaylist(input.playlist) }
      catch (error) { throw new HttpsError('invalid-argument', error.message) }
    }
    const playlistId = record?.playlistId ?? id
    if (typeof playlistId !== 'string' || !ID.test(playlistId)) {
      throw new HttpsError('invalid-argument', 'Ungültige Playlist-ID.')
    }
    const oldId = input.originalPlaylistId
    if (oldId != null && (typeof oldId !== 'string' || !ID.test(oldId) || oldId !== playlistId)) {
      throw new HttpsError('invalid-argument', 'Eine Playlist-ID kann nicht geändert werden. Bitte neu anlegen.')
    }
    const ref = playlists.doc(playlistId)
    return db.runTransaction(async tx => {
      const [meta, existing] = await Promise.all([tx.get(config), tx.get(ref)])
      const revision = meta.exists ? meta.data()?.revision : 0
      if (revision !== input.expectedRevision || !validRevision(revision)) {
        throw new HttpsError('aborted', 'Die Playlistliste wurde inzwischen geändert. Bitte aktualisieren.')
      }
      if (action === 'remove') {
        if (!existing.exists) throw new HttpsError('not-found', 'Playlist nicht gefunden.')
        tx.delete(ref)
      } else {
        if (!existing.exists && input.originalPlaylistId) {
          throw new HttpsError('not-found', 'Die zu bearbeitende Playlist existiert nicht mehr.')
        }
        if (existing.exists && !input.originalPlaylistId) {
          throw new HttpsError('already-exists', 'Diese Playlist-ID ist bereits eingetragen.')
        }
        tx.set(ref, {
          schemaVersion: 1, ...record,
          createdAt: existing.exists ? existing.data().createdAt : FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid,
        })
      }
      // No automatic migration/cutover: active inputs are only staged for the
      // explicit later end-to-end adapter switch.
      tx.set(config, {
        schemaVersion: 1, revision: revision + 1,
        pipelineMode: 'legacy', updatedAt: FieldValue.serverTimestamp(),
        updatedBy: request.auth.uid,
      }, { merge: true })
      return { playlistId, revision: revision + 1, pipelineMode: 'legacy' }
    })
  }
}
module.exports = { createPlaylistHandler }
