const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore')
const { validateAnnouncement } = require('./announcementValidation')

initializeApp()

exports.publishAnnouncement = onCall({
  region: 'europe-west1',
  serviceAccount: 'movie-hub-admin-runtime@movie-hub-62459.iam.gserviceaccount.com',
}, async (request) => {
  if (!request.auth || request.auth.token.movieHubAdmin !== true) {
    throw new HttpsError('permission-denied', 'Nur Movie-Hub-Administratoren dürfen Mitteilungen veröffentlichen.')
  }
  let announcement
  try { announcement = validateAnnouncement(request.data) }
  catch (error) { throw new HttpsError('invalid-argument', error.message) }

  const document = await getFirestore().collection('announcements').add({
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
})
