const { test } = require('node:test')
const assert = require('node:assert/strict')
const { parseArgs, nextClaims } = require('./grantAdmin')

test('requires an email and preserves existing claims', () => {
  assert.throws(() => parseArgs([]))
  assert.deepEqual(parseArgs(['--email', 'owner@example.org']), { email: 'owner@example.org', applyUid: '' })
  assert.deepEqual(nextClaims({ anotherClaim: 'kept' }), { anotherClaim: 'kept', movieHubAdmin: true })
})
