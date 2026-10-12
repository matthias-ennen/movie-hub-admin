const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createAnnouncementHandler } = require('./announcementHandler')

const NOW = Date.parse('2026-10-12T12:00:00Z')
const at = (value) => ({ toMillis: () => value })
const auth = { uid: 'admin-one', token: { movieHubAdmin: true, email_verified: true } }
const notice = (extra = {}) => ({ schemaVersion: 1, status: 'published', mode: 'startup',
  title: 'Wartung', body: 'Ein kurzer Hinweis.', startsAt: at(NOW - 1000), expiresAt: at(NOW + 60000),
  createdAt: at(NOW - 2000), createdBy: 'original-admin', ...extra })
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code } }

function fixture(initial = []) {
  const documents = new Map(initial)
  const writes = []
  let dbAccesses = 0
  let queryLimit = null
  const snapshot = (id) => ({ id, exists: documents.has(id), data: () => documents.get(id) })
  const db = {
    collection(name) {
      assert.equal(name, 'announcements')
      const criteria = { orders: [] }
      const collection = {
        doc: (id) => ({ id }),
        async add(data) { documents.set('new-announcement', data); writes.push(data); return { id: 'new-announcement' } },
        where(field, op, value) { assert.equal(field, 'expiresAt'); assert.equal(op, '>'); criteria.after = value.toMillis(); return collection },
        orderBy(field, direction) { criteria.orders.push([field, direction]); return collection },
        startAfter(date, id) { criteria.cursor = [date.toMillis(), id]; return collection },
        limit(value) { queryLimit = value; return collection },
        async get() {
          assert.deepEqual(criteria.orders, [['expiresAt', 'asc'], ['__name__', 'asc']])
          const compare = (a, b) => a[1].expiresAt.toMillis() - b[1].expiresAt.toMillis() || a[0].localeCompare(b[0])
          const rows = [...documents].filter(([, data]) => data.expiresAt.toMillis() > criteria.after)
            .sort(compare).filter(([id, data]) => !criteria.cursor || data.expiresAt.toMillis() > criteria.cursor[0]
              || (data.expiresAt.toMillis() === criteria.cursor[0] && id > criteria.cursor[1]))
            .slice(0, queryLimit).map(([id]) => snapshot(id))
          return { docs: rows, size: rows.length }
        },
      }
      return collection
    },
    async runTransaction(callback) {
      return callback({
        get: async (ref) => snapshot(ref.id),
        update(ref, changes) { writes.push(changes); documents.set(ref.id, { ...documents.get(ref.id), ...changes }) },
      })
    },
  }
  const handle = createAnnouncementHandler({
    getDb: () => { dbAccesses++; return db }, Timestamp: { fromMillis: at },
    FieldValue: { serverTimestamp: () => at(NOW) }, FieldPath: { documentId: () => '__name__' }, HttpsError, now: () => NOW,
  })
  return { handle, documents, writes, get dbAccesses() { return dbAccesses }, get queryLimit() { return queryLimit } }
}

for (const action of ['publish', 'list', 'withdraw']) {
  test(`${action} rejects anonymous, normal and unverified accounts before accessing Firestore`, async () => {
    const state = fixture()
    for (const candidate of [null, { ...auth, token: { email_verified: true } },
      { ...auth, token: { movieHubAdmin: true, email_verified: false } },
      { ...auth, token: { movieHubAdmin: 'true', email_verified: true } }]) {
      await assert.rejects(state.handle({ auth: candidate, data: { action, id: 'notice' } }), { code: 'permission-denied' })
    }
    assert.equal(state.dbAccesses, 0)
    assert.equal(state.writes.length, 0)
  })
}

test('old publication payload remains compatible; server owns status and audit fields', async () => {
  const state = fixture()
  const result = await state.handle({ auth, data: {
    title: ' Hinweis ', body: ' Text ', mode: 'inbox', startsAt: new Date(NOW).toISOString(),
    expiresAt: new Date(NOW + 60000).toISOString(), status: 'withdrawn', createdBy: 'forged',
  } })
  const saved = state.documents.get(result.id)
  assert.equal(saved.status, 'published')
  assert.equal(saved.createdBy, auth.uid)
  assert.equal(saved.title, 'Hinweis')
  assert.equal(saved.createdAt.toMillis(), NOW)
})

test('list pages remain bounded and do not skip equal expiry dates; expired history is excluded', async () => {
  const state = fixture([
    ['old', notice({ expiresAt: at(NOW) })],
    ...Array.from({ length: 23 }, (_, i) => [`notice-${String(i).padStart(2, '0')}`, notice(
      i === 0 ? { startsAt: at(NOW + 1000) } : i === 1 ? { status: 'withdrawn', withdrawnAt: at(NOW - 1) } : {},
    )]),
  ])
  const first = await state.handle({ auth, data: { action: 'list' } })
  assert.equal(state.queryLimit, 21)
  assert.equal(first.items.length, 20)
  assert.equal(first.items[0].startsAt, NOW + 1000)
  assert.equal(first.items[1].status, 'withdrawn')
  assert.equal(first.items[1].withdrawnAt, NOW - 1)
  const second = await state.handle({ auth, data: { action: 'list', cursor: first.nextCursor } })
  assert.equal(second.items.length, 3)
  assert.equal(second.nextCursor, null)
  assert.equal(new Set([...first.items, ...second.items].map((x) => x.id)).size, 23)
  assert.equal(state.writes.length, 0)
})

test('withdraw changes only status and adds audit context; retries retain the first withdrawal', async () => {
  const original = notice()
  const state = fixture([['notice', original]])
  assert.deepEqual(await state.handle({ auth, data: { action: 'withdraw', id: 'notice' } }),
    { id: 'notice', status: 'withdrawn', changed: true })
  const saved = state.documents.get('notice')
  for (const [key, value] of Object.entries(original)) if (key !== 'status') assert.equal(saved[key], value)
  assert.equal(saved.withdrawnBy, 'admin-one')
  assert.equal(saved.withdrawnAt.toMillis(), NOW)
  const replay = await state.handle({ auth: { ...auth, uid: 'admin-two' }, data: { action: 'withdraw', id: 'notice' } })
  assert.equal(replay.changed, false)
  assert.equal(state.documents.get('notice').withdrawnBy, 'admin-one')
  assert.equal(state.writes.length, 1)
})

test('scheduled publications can be withdrawn before they appear', async () => {
  const state = fixture([['scheduled', notice({ startsAt: at(NOW + 1000) })]])
  await state.handle({ auth, data: { action: 'withdraw', id: 'scheduled' } })
  assert.equal(state.documents.get('scheduled').status, 'withdrawn')
})

test('missing, expired, draft or unknown-schema entries cannot be changed', async () => {
  const state = fixture([
    ['expired', notice({ expiresAt: at(NOW) })], ['draft', notice({ status: 'draft' })],
    ['unknown', notice({ schemaVersion: 2 })],
  ])
  for (const id of ['missing', 'expired', 'draft', 'unknown']) {
    await assert.rejects(state.handle({ auth, data: { action: 'withdraw', id } }),
      { code: id === 'missing' ? 'not-found' : 'failed-precondition' })
  }
  assert.equal(state.writes.length, 0)
})

test('invalid actions, document paths and paging cursors fail before accessing Firestore', async () => {
  const state = fixture()
  for (const data of [null, [], { action: 'delete' }, { action: 'withdraw', id: '../users/alice' },
    { action: 'list', cursor: {} }, { action: 'list', cursor: { id: 'ok', expiresAt: Infinity } },
    { action: 'list', cursor: { id: 'ok', expiresAt: 253402300800000 } }]) {
    await assert.rejects(state.handle({ auth, data }), { code: 'invalid-argument' })
  }
  assert.equal(state.dbAccesses, 0)
})

