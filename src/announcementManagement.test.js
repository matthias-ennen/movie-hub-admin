import { test } from 'node:test'
import assert from 'node:assert/strict'
import { announcementStatus } from './announcementManagement.js'

const NOW = Date.parse('2026-10-12T12:00:00Z')

test('management status changes at the exact start/end; withdrawal stays explicit', async () => {
  const item = { status: 'published', startsAt: NOW, expiresAt: NOW + 1000 }
  assert.equal(announcementStatus(item, NOW - 1), 'Geplant')
  assert.equal(announcementStatus(item, NOW), 'Aktiv')
  assert.equal(announcementStatus(item, NOW + 1000), 'Abgelaufen')
  assert.equal(announcementStatus({ ...item, status: 'withdrawn' }, NOW + 1000), 'Zurückgezogen')
})
