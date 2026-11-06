'use strict'

// Admin playlist configuration: editorial offer hints, NOT verified playback rights.
const OFFERS = Object.freeze({
  free: ['free'], ads: ['ads'], flatrate: ['flatrate'],
  rent: ['rent'], buy: ['buy'], 'rent-buy': ['rent', 'buy'],
})
const PLAYLIST_ID = /^(?:PL|UU|OLAK5uy_)[A-Za-z0-9_-]{10,120}$/
const HOSTS = new Set(['www.youtube.com','youtube.com','m.youtube.com','music.youtube.com'])

function playlistIdFromInput(value) {
  if (typeof value !== 'string') return null
  const input = value.trim()
  if (PLAYLIST_ID.test(input)) return input
  try {
    const url = new URL(input)
    if (url.protocol !== 'https:' || !HOSTS.has(url.hostname)
      || !['/playlist', '/watch'].includes(url.pathname)) return null
    const id = url.searchParams.get('list')
    return PLAYLIST_ID.test(id || '') ? id : null
  } catch { return null }
}

function normalizePlaylist(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw Error('Ungültige Playlist-Daten.')
  }
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (name.length < 1 || name.length > 100) {
    throw Error('Playlist-Name muss zwischen 1 und 100 Zeichen enthalten.')
  }
  const playlistId = playlistIdFromInput(input.url ?? input.playlistId)
  if (!playlistId) throw Error('Bitte einen gültigen öffentlichen YouTube-Playlist-Link eintragen.')
  if (!Object.hasOwn(OFFERS, input.offerKind)) throw Error('Ungültige Angebotsart.')
  if (input.enabled !== true && input.enabled !== false) {
    throw Error('Aktivstatus fehlt.')
  }
  return {
    playlistId, name, url: 'https://www.youtube.com/playlist?list=' + playlistId,
    offerKind: input.offerKind, offerTypes: [...OFFERS[input.offerKind]],
    enabled: input.enabled,
  }
}
function validRevision(value) {
  return Number.isSafeInteger(value) && value >= 0
}
module.exports = { OFFERS, playlistIdFromInput, normalizePlaylist, validRevision }
