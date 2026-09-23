// Einmalig in einer berechtigten Admin-Umgebung mit Application Default Credentials ausführen.
const { initializeApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')

function parseArgs(args) {
  const emailIndex = args.indexOf('--email')
  const applyIndex = args.indexOf('--apply-uid')
  const email = emailIndex >= 0 ? args[emailIndex + 1] : ''
  const applyUid = applyIndex >= 0 ? args[applyIndex + 1] : ''
  if (!email || !email.includes('@') || email.startsWith('--') || (applyIndex >= 0 && (!applyUid || applyUid.startsWith('--')))) {
    throw new Error('Aufruf: node scripts/grantAdmin.js --email <Adresse> [--apply-uid <angezeigte UID>]')
  }
  return { email, applyUid }
}

function nextClaims(existing = {}) {
  return { ...existing, movieHubAdmin: true }
}

async function main() {
  const { email, applyUid } = parseArgs(process.argv.slice(2))
  initializeApp({ projectId: 'movie-hub-62459' })
  const auth = getAuth()
  const user = await auth.getUserByEmail(email)
  console.log(`Konto: ${user.email}; UID: ${user.uid}; E-Mail bestätigt: ${user.emailVerified}`)
  if (!applyUid) {
    console.log(`Vorschau. Nach Prüfung: node scripts/grantAdmin.js --email <Adresse> --apply-uid ${user.uid}`)
    return
  }
  if (applyUid !== user.uid) throw new Error('UID stimmt nicht mit der E-Mail-Adresse überein. Keine Änderung.')
  if (!user.emailVerified) throw new Error('E-Mail-Adresse ist nicht bestätigt. Keine Admin-Berechtigung vergeben.')
  if (user.customClaims?.movieHubAdmin === true) {
    console.log('Berechtigung ist bereits gesetzt.')
    return
  }
  await auth.setCustomUserClaims(user.uid, nextClaims(user.customClaims))
  console.log(`Admin-Berechtigung für UID ${user.uid} gesetzt.`)
}

if (require.main === module) main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})

module.exports = { parseArgs, nextClaims }
