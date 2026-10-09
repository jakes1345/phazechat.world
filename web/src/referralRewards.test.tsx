import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Emoticon } from './emoticonArt'
import { RARITIES, REWARDS, SenderItemsContext, isReward, rewardById } from './referralRewards'
import { effectIn, tokenize } from './emoticons'

const render = (owned: string[], id: string, shortcut: string) =>
  renderToStaticMarkup(
    <SenderItemsContext.Provider value={new Set(owned)}><Emoticon id={id} shortcut={shortcut} /></SenderItemsContext.Provider>,
  )

describe('reward catalog', () => {
  it('has unique ids and shortcuts, none clashing with built-in emoticons', () => {
    expect(new Set(REWARDS.map((r) => r.id)).size).toBe(REWARDS.length)
    expect(new Set(REWARDS.map((r) => r.shortcut)).size).toBe(REWARDS.length)
    for (const r of REWARDS) {
      // Reward shortcodes tokenize to the reward, never to a free emoticon.
      expect(tokenize(r.shortcut)).toEqual([{ kind: 'emoticon', id: r.id, shortcut: r.shortcut }])
    }
  })

  it('every rarity has items and odds that sum to 100', () => {
    expect(RARITIES.reduce((n, r) => n + r.odds, 0)).toBe(100)
    for (const r of RARITIES) expect(REWARDS.some((x) => x.rarity === r.id)).toBe(true)
  })
})

describe('ownership-gated rendering', () => {
  it('draws art only when the SENDER owns the reward', () => {
    expect(render([], 'crown', '(crown)')).toBe('(crown)')
    expect(render(['rocket'], 'crown', '(crown)')).toBe('(crown)')
    expect(render(['crown'], 'crown', '(crown)')).toContain('<svg')
  })

  it('has art for every reward', () => {
    for (const r of REWARDS) {
      expect(render([r.id], r.id, r.shortcut), r.id).toContain('<svg')
    }
  })

  it('never gates ordinary emoticons', () => {
    expect(isReward('smile')).toBe(false)
    expect(render([], 'smile', ':)')).toContain('<svg')
  })

  it('stickers draw big only when asked', () => {
    const own = new Set(['sticker-cat'])
    const big = renderToStaticMarkup(<SenderItemsContext.Provider value={own}><Emoticon id="sticker-cat" big /></SenderItemsContext.Provider>)
    const small = render(['sticker-cat'], 'sticker-cat', '(sticker-cat)')
    expect(big).toContain('sticker-big')
    expect(small).toContain('sticker-inline')
  })
})

describe('effectIn', () => {
  const owns = (...ids: string[]) => (id: string) => ids.includes(id)
  it('finds an owned effect in a message', () => {
    expect(effectIn('woo (confetti) party', owns('fx-confetti'))).toBe('fx-confetti')
  })
  it('ignores effects the sender does not own, and ordinary text', () => {
    expect(effectIn('(confetti)', owns())).toBeNull()
    expect(effectIn('(aurora)', owns('fx-confetti'))).toBeNull()
    expect(effectIn('hello (smile)', owns('fx-confetti'))).toBeNull()
  })
  it('only effects trigger, not owned emoticons/stickers', () => {
    expect(effectIn('(crown) (sticker-cat)', owns('crown', 'sticker-cat'))).toBeNull()
  })
  it('catalog lookups stay consistent', () => {
    expect(rewardById('fx-aurora')?.kind).toBe('effect')
  })
})
