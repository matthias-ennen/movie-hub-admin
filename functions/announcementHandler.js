const { validateAnnouncement } = require('./announcementValidation')

const PAGE_SIZE = 20
const validId = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value)
const millis = (value) => value?.toMillis?.() ?? null

// One existing callable and IAM boundary; old clients still publish without an action.
function createAnnouncementHandler({ getDb, Timestamp, FieldValue, FieldPath, HttpsError, now = Date.now }) {
  return async function handleAnnouncement(request) {
    if (!request.auth || request.auth.token.movieHubAdmin !== true || request.auth.token.email_verified !== true) {
      throw new HttpsError('permission-denied', 'Nur Movie-Hub-Administratoren mit bestätigter E-Mail-Adresse dürfen Mitteilungen verwalten.')
    }
    const input = request.data
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new HttpsError('invalid-argument', 'Ungültige Anfrage.')
    }
    const action = input.action ?? 'publish'
    if (action === 'publish') {
      let announcement
      try { announcement = validateAnnouncement(input, now()) }
      catch (error) { throw new HttpsError('invalid-argument', error.message) }
      const document = await getDb().collection('announcements').add({
        schemaVersion: 1,
        status: 'published',
        mode: announcement.mode,
        title: announcement.title,
        body: announcement.body,
        startsAt: Timestamp.fromMillis(announcement.start),
        expiresAt: Timestamp.fromMillis(announcement.end),
        createdAt: FieldValue.serverTimestamp(),
        createdBy: request.auth.uid,
      })
      return { id: document.id }
    }

    if (action === 'list') {
      const cursor = input.cursor
      if (cursor != null && (typeof cursor !== 'object' || Array.isArray(cursor)
        || !validId(cursor.id) || !Number.isSafeInteger(cursor.expiresAt)
        || cursor.expiresAt < 0 || cursor.expiresAt > 253402300799999)) {
        throw new HttpsError('invalid-argument', 'Ungültige Listenseite.')
      }
      // Single-field expiry index; no full history scan or extra client rights.
      let query = getDb().collection('announcements')
        .where('expiresAt', '>', Timestamp.fromMillis(now()))
        .orderBy('expiresAt', 'asc').orderBy(FieldPath.documentId(), 'asc')
      if (cursor) query = query.startAfter(Timestamp.fromMillis(cursor.expiresAt), cursor.id)
      const snapshot = await query.limit(PAGE_SIZE + 1).get()
      const page = snapshot.docs.slice(0, PAGE_SIZE)
      const items = page.map((doc) => {
        const item = doc.data()
        return { id: doc.id, schemaVersion: item.schemaVersion, status: item.status,
          title: item.title, body: item.body, mode: item.mode,
          startsAt: millis(item.startsAt), expiresAt: millis(item.expiresAt),
          createdAt: millis(item.createdAt), withdrawnAt: millis(item.withdrawnAt) }
      }).filter((item) => item.schemaVersion === 1 && ['published', 'withdrawn'].includes(item.status)
        && ['inbox', 'startup'].includes(item.mode) && typeof item.title === 'string'
        && typeof item.body === 'string' && Number.isFinite(item.startsAt) && Number.isFinite(item.expiresAt))
      const last = page.at(-1)
      return { items, nextCursor: snapshot.size > PAGE_SIZE
        ? { id: last.id, expiresAt: millis(last.data().expiresAt) } : null }
    }

    if (action === 'withdraw') {
      if (!validId(input.id)) throw new HttpsError('invalid-argument', 'Ungültige Mitteilung.')
      const db = getDb()
      const ref = db.collection('announcements').doc(input.id)
      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref)
        if (!snapshot.exists) throw new HttpsError('not-found', 'Die Mitteilung wurde nicht gefunden.')
        const item = snapshot.data()
        // Repeated clicks/retries preserve the first administrator and timestamp.
        if (item.status === 'withdrawn') return { id: ref.id, status: 'withdrawn', changed: false }
        if (item.schemaVersion !== 1 || item.status !== 'published'
          || !Number.isFinite(millis(item.expiresAt)) || millis(item.expiresAt) <= now()) {
          throw new HttpsError('failed-precondition', 'Die Mitteilung ist nicht mehr veröffentlicht oder bereits abgelaufen. Bitte die Liste aktualisieren.')
        }
        transaction.update(ref, { status: 'withdrawn', withdrawnAt: FieldValue.serverTimestamp(), withdrawnBy: request.auth.uid })
        return { id: ref.id, status: 'withdrawn', changed: true }
      })
    }
    throw new HttpsError('invalid-argument', 'Unbekannte Aktion.')
  }
}

module.exports = { createAnnouncementHandler }
