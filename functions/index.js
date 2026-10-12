const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore, Timestamp, FieldValue, FieldPath } = require('firebase-admin/firestore')
const { createAnnouncementHandler } = require('./announcementHandler')

initializeApp()

exports.publishAnnouncement = onCall({
  region: 'europe-west1',
  serviceAccount: 'movie-hub-admin-runtime@movie-hub-62459.iam.gserviceaccount.com',
}, createAnnouncementHandler({ getDb: getFirestore, Timestamp, FieldValue, FieldPath, HttpsError }))

