import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ContactCardView } from './ContactCard'
import ConversationGallery from './ConversationGallery'
import { encodeQuote } from './messageKinds'

const noop = () => {}

describe('contact card', () => {
  const card = { username: 'ana', display: 'Ana B', mood: 'back monday' }
  const render = (me: string | null, friends: Record<string, string>) => renderToStaticMarkup(
    <ContactCardView card={card} me={me} friends={friends} color="#123" onAdd={noop} onMessage={noop} onProfile={noop} />,
  )

  it('offers to add someone who is not a contact yet', () => {
    const html = render('bob', {})
    expect(html).toContain('Ana B')
    expect(html).toContain('back monday')
    expect(html).toContain('Add contact')
  })

  it('offers a message to an existing contact, and nothing for yourself', () => {
    expect(render('bob', { ana: 'Online' })).toContain('Message')
    expect(render('ana', {})).toContain('That&#x27;s you')
  })
})

describe('chat gallery', () => {
  const lines = [
    { id: '1', from: 'ana', ts: 1, text: '', file: { url: '/u/a.png', name: 'a.png', mime: 'image/png', size: 10 } },
    { id: '2', from: 'bob', ts: 2, text: '', file: { url: '/u/b.pdf', name: 'b.pdf', mime: 'application/pdf', size: 10 } },
    { id: '3', from: 'ana', ts: 3, text: encodeQuote({ id: '1', from: 'ana', text: 'q', ts: 1 }, 'see https://example.com/x ok') },
    { id: '4', from: 'ana', ts: 4, text: 'deleted https://gone.example', deleted: true },
  ]

  it('counts media, files and links, skipping deleted messages', () => {
    const html = renderToStaticMarkup(
      <ConversationGallery lines={lines} bookmarkIds={new Set(['2'])} bookmarksOn onJump={noop} onClose={noop} />,
    )
    expect(html).toMatch(/Media <span class="convo-gallery-count">1</)
    expect(html).toMatch(/Files <span class="convo-gallery-count">1</)
    expect(html).toMatch(/Links <span class="convo-gallery-count">1</)
    expect(html).toMatch(/Bookmarks <span class="convo-gallery-count">1</)
    expect(html).toContain('/u/a.png')
  })

  it('hides the bookmarks tab when the era has no bookmarks', () => {
    const html = renderToStaticMarkup(
      <ConversationGallery lines={lines} bookmarkIds={new Set()} bookmarksOn={false} onJump={noop} onClose={noop} />,
    )
    expect(html).not.toContain('Bookmarks')
  })
})
