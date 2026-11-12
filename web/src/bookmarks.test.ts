import { describe, it, expect } from 'vitest'
import { parseBookmarks, serializeBookmarks, toggleBookmark, bookmarkIdsFor, BOOKMARKS_MAX } from './bookmarks'

describe('bookmarks', () => {
  it('toggles on and off per conversation', () => {
    let list = toggleBookmark([], 'ana', 'm1', 1)
    list = toggleBookmark(list, 'g:42', 'm1', 2)
    expect(bookmarkIdsFor(list, 'ana')).toEqual(new Set(['m1']))
    list = toggleBookmark(list, 'ana', 'm1', 3)
    expect(bookmarkIdsFor(list, 'ana').size).toBe(0)
    expect(bookmarkIdsFor(list, 'g:42')).toEqual(new Set(['m1']))
  })

  it('round-trips and ignores junk', () => {
    const list = toggleBookmark([], 'ana', 'm1', 1)
    expect(parseBookmarks(serializeBookmarks(list))).toEqual(list)
    expect(parseBookmarks('not json')).toEqual([])
    expect(parseBookmarks('[{"c":"a"},{"c":"a","id":"x","at":1}]')).toEqual([{ c: 'a', id: 'x', at: 1 }])
  })

  it('stores ids only, and stays under the settings size cap at the limit', () => {
    let list: ReturnType<typeof parseBookmarks> = []
    for (let i = 0; i < BOOKMARKS_MAX + 20; i++) list = toggleBookmark(list, `user_with_a_long_name_${i % 7}`, `m-${i}-0123456789abcdef`, i)
    expect(list.length).toBe(BOOKMARKS_MAX)
    expect(list[0].id).toBe('m-20-0123456789abcdef')
    expect(serializeBookmarks(list).length).toBeLessThan(64 * 1024)
  })
})
