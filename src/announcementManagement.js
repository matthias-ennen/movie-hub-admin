export function announcementStatus(item, now = Date.now()) {
  if (item.status === 'withdrawn') return 'Zurückgezogen'
  if (item.expiresAt <= now) return 'Abgelaufen'
  return item.startsAt > now ? 'Geplant' : 'Aktiv'
}

export function displayDate(value) {
  return Number.isFinite(value) ? new Date(value).toLocaleString('de-DE') : '–'
}
