const { test } = require('node:test')
const assert = require('node:assert/strict')
const { playlistIdFromInput, normalizePlaylist, OFFERS } = require('./playlistValidation')
const GOOD = 'PL9hLFbkmRD8nBj_e8FfntoBporPAqqeSJ'

test('YouTube URLs normalize to a stable playlist ID, never trust lookalike hosts', () => {
  assert.equal(playlistIdFromInput('https://youtube.com/playlist?list=' + GOOD + '&si=x'), GOOD)
  assert.equal(playlistIdFromInput(GOOD), GOOD)
  for (const url of ['https://youtube.com.evil.test/playlist?list=' + GOOD,
    'http://youtube.com/playlist?list=' + GOOD,
    'https://youtube.com/redirect?list=' + GOOD, 'https://youtu.be/playlist?list=' + GOOD]) {
    assert.equal(playlistIdFromInput(url), null)
  }
})
test('exact six editorial choices and safe storage', () => {
  assert.deepEqual(Object.keys(OFFERS), ['free', 'ads', 'flatrate', 'rent', 'buy', 'rent-buy'])
  const values = normalizePlaylist({ name: ' FREE  ', url: GOOD, offerKind: 'rent-buy', enabled: true })
  assert.equal(values.name, 'FREE')
  assert.deepEqual(values.offerTypes, ['rent', 'buy'])
  assert.equal(values.url, 'https://www.youtube.com/playlist?list=' + GOOD)
  assert.throws(() => normalizePlaylist({ ...values, offerKind: 'air' }), /Angebotsart/)
  assert.throws(() => normalizePlaylist({ ...values, name: '' }), /Playlist-Name/)
})
