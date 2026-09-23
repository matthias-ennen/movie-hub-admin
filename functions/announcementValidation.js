function validateAnnouncement(input, now = Date.now()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Ungültige Mitteilung.')
  const { title, body, mode, startsAt, expiresAt } = input
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 120) throw new Error('Der Titel muss 1 bis 120 Zeichen enthalten.')
  if (typeof body !== 'string' || !body.trim() || body.trim().length > 4000) throw new Error('Der Text muss 1 bis 4000 Zeichen enthalten.')
  if (!['inbox', 'startup'].includes(mode)) throw new Error('Ungültige Anzeigeart.')
  if (typeof startsAt !== 'string' || typeof expiresAt !== 'string') throw new Error('Zeitraum fehlt.')
  const start = Date.parse(startsAt)
  const end = Date.parse(expiresAt)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end <= now || end - start > 90 * 86400000) {
    throw new Error('Gültigkeit muss in der Zukunft enden und darf höchstens 90 Tage dauern.')
  }
  return { title: title.trim(), body: body.trim(), mode, start, end }
}

module.exports = { validateAnnouncement }
