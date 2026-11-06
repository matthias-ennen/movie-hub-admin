import test from 'node:test'
import assert from 'node:assert/strict'
import { OFFER_OPTIONS, playlistIdFromInput, validatePlaylistDraft } from './playlistManagement.js'
const free = 'PL9hLFbkmRD8nBj_e8FfntoBporPAqqeSJ'
test('six supported editorial offer selectors', () => {
  assert.deepEqual(OFFER_OPTIONS.map(x => x.value), ['free','ads','flatrate','rent','buy','rent-buy'])
})
test('URLs canonicalized, unsafe sites refused', () => {
  assert.equal(playlistIdFromInput('https://www.youtube.com/playlist?list=' + free), free)
  assert.equal(playlistIdFromInput('http://youtube.com/playlist?list=' + free), null)
  assert.equal(playlistIdFromInput('https://youtube.com.evil.com/playlist?list=' + free), null)
  assert.equal(playlistIdFromInput('https://youtube.com/watch?v=123&list=' + free), free)
})
test('draft normalization uses exact playlist IDs and offer kind', () => {
  const item = validatePlaylistDraft({ name:' Liste  ',url:'https://youtube.com/playlist?list=' + free,offerKind:'rent-buy',enabled:true })
  assert.equal(item.playlistId,free)
  assert.equal(item.name,'Liste')
  assert.equal(item.enabled,true)
  assert.throws(() => validatePlaylistDraft({...item,name:' '}),/Namen/)
  assert.throws(() => validatePlaylistDraft({...item,offerKind:'air'}),/Angebotsart/)
})
