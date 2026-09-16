import { describe, it, expect } from 'vitest'
import {
  THEMES, SELECTABLE_THEMES, DEFAULT_THEME, resolveTheme, nextTheme,
  hasFeature, featuresOf, isSkypeEra, isClassicSkype, type ThemeId, type Feature,
} from './themes'

/**
 * Era feature gating.
 *
 * These aren't "does the function return a boolean" tests — each one pins a
 * date boundary that was got wrong at least once, so that changing it means
 * changing a test and having to justify it against
 * docs/skype-era-research.md.
 */

const ERAS: ThemeId[] = ['skype3', 'skype4', 'skype5', 'skype6', 'skype7', 'skype8']

describe('era feature gating', () => {
  it('lets Skype 3 have the group chat it actually had', () => {
    // This is the correction that matters most: group chat and conference
    // calling were gated at Skype 5, which conflated them with group VIDEO.
    // Skype was designing multi-person chat in 2004 and Skypecasts carried
    // ~100 people in 3.0. Denying it to 3.x and 4.x was a real bug.
    expect(hasFeature('skype3', 'group_chat')).toBe(true)
    expect(hasFeature('skype3', 'group_call')).toBe(true)
    expect(hasFeature('skype4', 'group_chat')).toBe(true)
  })

  it('holds group video back to Skype 5, where it belongs', () => {
    expect(hasFeature('skype4', 'group_video')).toBe(false)
    expect(hasFeature('skype5', 'group_video')).toBe(true)
  })

  it('introduces screen sharing at Skype 4 (4.1, 2009)', () => {
    expect(hasFeature('skype3', 'screen_share')).toBe(false)
    expect(hasFeature('skype4', 'screen_share')).toBe(true)
  })

  it('introduces Mojis at Skype 7 (September 2015)', () => {
    expect(hasFeature('skype6', 'mojis')).toBe(false)
    expect(hasFeature('skype7', 'mojis')).toBe(true)
  })

  it('gives Skype 3 message editing, not just Skype 8', () => {
    // Used to be gated to Skype 8 on the assumption that reactions,
    // @mentions, edit and delete all launched together in July 2018.
    // docs/skype-eras/skype3.md sources AfterDawn's version-history page:
    // "Edit chat messages" shipped in build 3.2.0.163, 2007 — eleven years
    // earlier. See docs/skype-eras/GATING-DIFF.md correction #1.
    for (const era of ERAS) {
      expect(hasFeature(era, 'edit_message'), `${era} must offer edit_message`).toBe(true)
    }
  })

  it('gives Skype 7 Stories, via the real "Highlights" feature', () => {
    // Stories used to be a Phaze original with no real Skype equivalent.
    // docs/skype-eras/skype8.md sources Skype's real "Highlights" feature
    // — a Stories-style photo/video feed — shipping under the Skype 7
    // version number in August 2017, removed again in September 2018.
    // Phaze's Stories UI is still original work; only the era boundary is
    // a recreation. See docs/skype-eras/GATING-DIFF.md correction #3.
    expect(hasFeature('skype6', 'stories')).toBe(false)
    expect(hasFeature('skype7', 'stories')).toBe(true)
    expect(hasFeature('skype8', 'stories')).toBe(true)
  })

  it('keeps Skype 8 conversation features out of every classic era', () => {
    // Reactions and @mentions shipped with 8.0 in July 2018; read receipts
    // followed that summer. delete_message has only weaker, undated
    // evidence of predating Skype 8 (see GATING-DIFF.md) and is left here
    // deliberately, pending firmer sourcing — unlike edit_message and
    // stories, which had strong enough evidence to move (see above).
    const eightOnly: Feature[] = [
      'reactions', 'mentions', 'delete_message', 'read_receipts',
    ]
    for (const era of ERAS.filter((e) => e !== 'skype8')) {
      for (const f of eightOnly) {
        expect(hasFeature(era, f), `${era} must not offer ${f}`).toBe(false)
      }
    }
    for (const f of eightOnly) expect(hasFeature('skype8', f)).toBe(true)
  })

  it('treats Phaze originals as modern-only, including remote control', () => {
    // Remote control used to be dated to Skype 6 on an admitted guess. No
    // consumer Skype shipped remote desktop control — "give control" is
    // Skype for Business, the same lineage as the whiteboard.
    const originals: Feature[] = [
      'spaces', 'live_streams', 'pinned_messages', 'remote_control',
    ]
    for (const era of ERAS.filter((e) => e !== 'skype8')) {
      for (const f of originals) {
        expect(hasFeature(era, f), `${era} must not offer ${f}`).toBe(false)
      }
    }
  })

  it('never takes a feature away as the eras advance', () => {
    // Skype only accumulated. A later era missing something an earlier one
    // has means a boundary was written the wrong way round.
    for (let i = 1; i < ERAS.length; i++) {
      const prev = featuresOf(ERAS[i - 1])
      const cur = featuresOf(ERAS[i])
      for (const f of prev) {
        expect(cur, `${ERAS[i]} lost ${f} that ${ERAS[i - 1]} had`).toContain(f)
      }
    }
  })

  it('gives Skype 6 the same features as Skype 5', () => {
    // Not an oversight: Skype 6's changes were Microsoft account sign-in and
    // the Messenger merge — account plumbing, not conversation features.
    expect([...featuresOf('skype6')].sort()).toEqual([...featuresOf('skype5')].sort())
  })
})

describe('theme selection', () => {
  it('offers only the six eras, not the shelved Phaze themes', () => {
    expect(SELECTABLE_THEMES.map((t) => t.id)).toEqual(ERAS)
    expect(SELECTABLE_THEMES.every((t) => t.era)).toBe(true)
  })

  it('moves anyone still on a shelved theme to the default', () => {
    expect(resolveTheme('light')).toBe(DEFAULT_THEME)
    expect(resolveTheme('dark')).toBe(DEFAULT_THEME)
    expect(resolveTheme('skype3')).toBe('skype3')
    expect(resolveTheme('nonsense')).toBe(DEFAULT_THEME)
    expect(resolveTheme(null)).toBe(DEFAULT_THEME)
  })

  it('cycles only through themes a person can pick', () => {
    // Walking the full cycle must never land on a hidden theme.
    let t: ThemeId = DEFAULT_THEME
    for (let i = 0; i < THEMES.length + 2; i++) {
      t = nextTheme(t)
      expect(ERAS).toContain(t)
    }
  })

  it('classes Skype 8 as an era but not a classic one', () => {
    // The two are different questions: .skype-era hides the Phaze chrome for
    // all six, .classic-era is the narrower 3-7 house style.
    expect(isSkypeEra('skype8')).toBe(true)
    expect(isClassicSkype('skype8')).toBe(false)
    for (const era of ERAS.filter((e) => e !== 'skype8')) {
      expect(isClassicSkype(era)).toBe(true)
    }
  })
})
