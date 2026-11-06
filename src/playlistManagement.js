export const OFFER_OPTIONS = Object.freeze([
  { value: 'free', label: 'FREE – kostenlos' },
  { value: 'ads', label: 'ADS – kostenlos mit Werbung' },
  { value: 'flatrate', label: 'FLAT – im Abo enthalten' },
  { value: 'rent', label: 'RENT – leihen' },
  { value: 'buy', label: 'BUY – kaufen' },
  { value: 'rent-buy', label: 'R&B – leihen und kaufen' },
])
const ID = /^(?:PL|UU|OLAK5uy_)[A-Za-z0-9_-]{10,120}$/
const HOSTS = new Set(['www.youtube.com', 'youtube.com', 'm.youtube.com', 'music.youtube.com'])

export function playlistIdFromInput(value) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (ID.test(text)) return text
  try {
    const url = new URL(text)
    if (url.protocol !== 'https:' || !HOSTS.has(url.hostname)
      || !['/playlist', '/watch'].includes(url.pathname)) return null
    const id = url.searchParams.get('list')
    return ID.test(id || '') ? id : null
  } catch { return null }
}

export function playlistLabel(value) {
  return OFFER_OPTIONS.find(option => option.value === value)?.label || 'Unbekannte Angebotsart'
}

export function validatePlaylistDraft(draft) {
  const name = typeof draft?.name === 'string' ? draft.name.trim() : ''
  const playlistId = playlistIdFromInput(draft?.url)
  if (!name || name.length > 100) throw Error('Bitte einen Namen mit 1 bis 100 Zeichen eingeben.')
  if (!playlistId) throw Error('Bitte einen gültigen öffentlichen YouTube-Playlist-Link eingeben.')
  if (!OFFER_OPTIONS.some(option => option.value === draft?.offerKind)) {
    throw Error('Bitte eine Angebotsart auswählen.')
  }
  return {
    name, url: 'https://www.youtube.com/playlist?list=' + playlistId,
    offerKind: draft.offerKind, enabled: Boolean(draft.enabled), playlistId,
  }
}
