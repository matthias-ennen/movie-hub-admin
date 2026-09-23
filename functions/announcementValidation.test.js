const { test } = require('node:test')
const assert = require('node:assert/strict')
const { validateAnnouncement } = require('./announcementValidation')

const base = { title: '  Hinweis  ', body: ' Text ', mode: 'inbox', startsAt: '2026-09-24T12:00:00.000Z', expiresAt: '2026-09-25T12:00:00.000Z' }
test('accepts and trims a finite window', () => {
  assert.equal(validateAnnouncement(base, Date.parse('2026-09-23')).title, 'Hinweis')
})
test('rejects expired and oversized announcements', () => {
  assert.throws(() => validateAnnouncement(base, Date.parse('2026-09-26')))
  assert.throws(() => validateAnnouncement({ ...base, body: 'x'.repeat(4001) }, Date.parse('2026-09-23')))
  assert.throws(() => validateAnnouncement({ ...base, mode: 'other' }, Date.parse('2026-09-23')))
})
