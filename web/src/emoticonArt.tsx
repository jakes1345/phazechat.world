import { EMOTICONS } from './emoticons'

const glyphs = new Map<string, string>(EMOTICONS.map((e) => [e.id, e.emoji]))

// Unicode fallback layer — Task 7 swaps in hand-drawn art per id and keeps
// this as the safety net for anything unmapped.
export function Emoticon({ id }: { id: string }) {
  return <span className="emoticon" role="img">{glyphs.get(id) ?? id}</span>
}
