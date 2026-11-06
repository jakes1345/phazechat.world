import { describe, it, expect } from 'vitest'
import {
  encodeContactCard, decodeContactCard, encodeQuote, decodeQuote,
  previewText, quotableText, QUOTE_TEXT_MAX,
} from './messageKinds'

describe('contact cards', () => {
  it('round-trips', () => {
    const body = encodeContactCard({ username: 'ana_b', display: 'Ana', mood: 'on holiday' })
    expect(decodeContactCard(body)).toEqual({ username: 'ana_b', display: 'Ana', mood: 'on holiday' })
  })

  it('rejects plain text and malformed bodies', () => {
    expect(decodeContactCard('hello')).toBeNull()
    expect(decodeContactCard('phaze-contact{not json')).toBeNull()
    expect(decodeContactCard('phaze-contact{"username":"has space"}')).toBeNull()
    expect(decodeContactCard('phaze-contact{"username":5}')).toBeNull()
  })
})

describe('quotes', () => {
  const q = { id: 'm1', from: 'ana', text: 'line one\nline two', ts: 1700000000000 }

  it('round-trips, including newlines in both parts', () => {
    const body = encodeQuote(q, 'reply\nsecond line')
    expect(decodeQuote(body)).toEqual({ quote: q, reply: 'reply\nsecond line' })
  })

  it('trims long quoted text', () => {
    const body = encodeQuote({ ...q, text: 'x'.repeat(1000) }, 'ok')
    expect(decodeQuote(body)!.quote.text.length).toBe(QUOTE_TEXT_MAX)
  })

  it('leaves ordinary text alone', () => {
    expect(decodeQuote('phaze-quote is a word I typed')).toBeNull()
    expect(decodeQuote('phaze-quote{"id":"a","from":"b","text":"c"}')).toBeNull() // no reply line
  })
})

describe('previews', () => {
  it('describes structured bodies the way a person sees them', () => {
    expect(previewText(encodeContactCard({ username: 'ana', display: 'Ana B' }))).toBe('👤 Ana B')
    expect(previewText(encodeQuote({ id: '1', from: 'a', text: 'q', ts: 0 }, 'the reply'))).toBe('the reply')
    expect(quotableText(encodeContactCard({ username: 'ana' }))).toBe('Contact: ana')
    expect(previewText('plain')).toBe('plain')
  })
})
