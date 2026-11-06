import { useMemo, useState } from 'react'
import { previewText } from './messageKinds'
import './eraFeatures.css'

/** Per-conversation gallery: everything shared in a chat, sorted into
 *  media, files and links, plus the messages this person bookmarked.
 *
 *  Built from the conversation as loaded, so it covers what this device has
 *  of the history, the same messages the chat itself can scroll to. */

export type GalleryLine = {
  id: string
  from: string
  ts: number
  text: string
  deleted?: boolean
  file?: { url: string; name: string; mime: string; size: number; kind?: string }
}

type Tab = 'media' | 'files' | 'links' | 'bookmarks'

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/g

function isMedia(mime: string, name: string): 'image' | 'video' | null {
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)) return 'image'
  if (mime.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(name)) return 'video'
  return null
}

function linksIn(text: string): string[] {
  return Array.from(new Set(previewText(text).match(URL_RE) ?? []))
}

export default function ConversationGallery({ lines, bookmarkIds, bookmarksOn, onJump, onClose }: {
  lines: GalleryLine[]
  bookmarkIds: ReadonlySet<string>
  /** Bookmarks are their own feature; the tab only shows when it's on. */
  bookmarksOn: boolean
  onJump: (id: string) => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<Tab>('media')
  const live = useMemo(() => lines.filter((l) => !l.deleted), [lines])
  const media = useMemo(() => live.filter((l) => l.file && isMedia(l.file.mime, l.file.name)).reverse(), [live])
  const files = useMemo(() => live.filter((l) => l.file && !isMedia(l.file.mime, l.file.name)).reverse(), [live])
  const links = useMemo(() => live.flatMap((l) => (l.file ? [] : linksIn(l.text).map((url) => ({ url, line: l })))).reverse(), [live])
  const marked = useMemo(() => live.filter((l) => bookmarkIds.has(l.id)).reverse(), [live, bookmarkIds])

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'media', label: 'Media', count: media.length },
    { id: 'files', label: 'Files', count: files.length },
    { id: 'links', label: 'Links', count: links.length },
  ]
  if (bookmarksOn) tabs.push({ id: 'bookmarks', label: 'Bookmarks', count: marked.length })

  return (
    <aside className="convo-gallery" aria-label="Chat gallery">
      <div className="convo-gallery-head">
        <span className="convo-gallery-title">Gallery</span>
        <button type="button" className="link-btn" onClick={onClose}>Close</button>
      </div>
      <div className="convo-gallery-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label} <span className="convo-gallery-count">{t.count}</span>
          </button>
        ))}
      </div>
      <div className="convo-gallery-body">
        {tab === 'media' && (media.length === 0 ? <p className="convo-gallery-empty">No photos or videos yet.</p> : (
          <div className="convo-gallery-grid">
            {media.map((l) => (
              <button key={l.id} type="button" className="convo-gallery-tile" onClick={() => onJump(l.id)} title={`${l.from} · ${new Date(l.ts).toLocaleString()}`}>
                {isMedia(l.file!.mime, l.file!.name) === 'image'
                  ? <img src={l.file!.url} alt={l.file!.name} loading="lazy" />
                  : <video src={l.file!.url} preload="metadata" muted />}
              </button>
            ))}
          </div>
        ))}
        {tab === 'files' && (files.length === 0 ? <p className="convo-gallery-empty">No files yet.</p> : (
          <ul className="convo-gallery-list">
            {files.map((l) => (
              <li key={l.id}>
                <a href={l.file!.url} target="_blank" rel="noopener noreferrer">{l.file!.name}</a>
                <button type="button" className="link-btn" onClick={() => onJump(l.id)}>{l.from} · {new Date(l.ts).toLocaleDateString()}</button>
              </li>
            ))}
          </ul>
        ))}
        {tab === 'links' && (links.length === 0 ? <p className="convo-gallery-empty">No links yet.</p> : (
          <ul className="convo-gallery-list">
            {links.map(({ url, line }, i) => (
              <li key={`${line.id}-${i}`}>
                <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>
                <button type="button" className="link-btn" onClick={() => onJump(line.id)}>{line.from} · {new Date(line.ts).toLocaleDateString()}</button>
              </li>
            ))}
          </ul>
        ))}
        {tab === 'bookmarks' && (marked.length === 0 ? <p className="convo-gallery-empty">Bookmark a message to keep it here.</p> : (
          <ul className="convo-gallery-list">
            {marked.map((l) => (
              <li key={l.id}>
                <button type="button" className="convo-gallery-bookmark" onClick={() => onJump(l.id)}>
                  <span className="muted small">{l.from} · {new Date(l.ts).toLocaleDateString()}</span>
                  <span>{l.file ? `📎 ${l.file.name}` : previewText(l.text).slice(0, 140)}</span>
                </button>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </aside>
  )
}
