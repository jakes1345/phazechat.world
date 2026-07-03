export type Token =
  | { kind: 'text'; value: string }
  | { kind: 'emoticon'; id: string; shortcut: string }

// The classic twenty plus a few extras. Order inside `shortcuts` doesn't
// matter — matching always takes the longest hit at each position.
export const EMOTICONS = [
  { id: 'smile', shortcuts: ['(smile)', ':-)', ':)'], emoji: '🙂', label: 'Smile' },
  { id: 'laugh', shortcuts: ['(laugh)', ':-D', ':D'], emoji: '😄', label: 'Laugh' },
  { id: 'wink', shortcuts: ['(wink)', ';-)', ';)'], emoji: '😉', label: 'Wink' },
  { id: 'sad', shortcuts: ['(sad)', ':-(', ':('], emoji: '🙁', label: 'Sad' },
  { id: 'cry', shortcuts: ['(cry)', ";'("], emoji: '😢', label: 'Crying' },
  { id: 'wave', shortcuts: ['(wave)', '(bye)'], emoji: '👋', label: 'Wave' },
  { id: 'heart', shortcuts: ['(heart)', '<3'], emoji: '❤️', label: 'Heart' },
  { id: 'kiss', shortcuts: ['(kiss)', ':-*', ':*'], emoji: '😘', label: 'Kiss' },
  { id: 'cool', shortcuts: ['(cool)', '8-)'], emoji: '😎', label: 'Cool' },
  { id: 'angry', shortcuts: ['(angry)', ':@'], emoji: '😠', label: 'Angry' },
  { id: 'surprised', shortcuts: ['(surprised)', ':-O', ':O'], emoji: '😮', label: 'Surprised' },
  { id: 'blush', shortcuts: ['(blush)', ':$'], emoji: '😊', label: 'Blushing' },
  { id: 'tongue', shortcuts: ['(tongue)', ':-P', ':P'], emoji: '😛', label: 'Tongue out' },
  { id: 'sweat', shortcuts: ['(sweat)', '(whew)'], emoji: '😅', label: 'Sweating' },
  { id: 'party', shortcuts: ['(party)'], emoji: '🥳', label: 'Party' },
  { id: 'sleepy', shortcuts: ['(sleepy)', '|-)'], emoji: '😪', label: 'Sleepy' },
  { id: 'think', shortcuts: ['(think)', ':-?'], emoji: '🤔', label: 'Thinking' },
  { id: 'yes', shortcuts: ['(yes)', '(y)'], emoji: '👍', label: 'Thumbs up' },
  { id: 'no', shortcuts: ['(no)', '(n)'], emoji: '👎', label: 'Thumbs down' },
  { id: 'hug', shortcuts: ['(hug)'], emoji: '🤗', label: 'Hug' },
] as const

const byShortcut = new Map<string, string>()
for (const e of EMOTICONS) for (const s of e.shortcuts) byShortcut.set(s, e.id)
// Longest first so ":-)" wins over ":)" when both could start at a position.
const allShortcuts = [...byShortcut.keys()].sort((a, b) => b.length - a.length)
const urlRe = /https?:\/\/\S+/y

export function tokenize(input: string): Token[] {
  const out: Token[] = []
  let text = ''
  let i = 0
  const flush = () => { if (text) { out.push({ kind: 'text', value: text }); text = '' } }
  outer: while (i < input.length) {
    urlRe.lastIndex = i
    const url = urlRe.exec(input)
    if (url) { text += url[0]; i += url[0].length; continue }
    for (const s of allShortcuts) {
      if (input.startsWith(s, i)) {
        flush()
        out.push({ kind: 'emoticon', id: byShortcut.get(s)!, shortcut: s })
        i += s.length
        continue outer
      }
    }
    text += input[i]
    i += 1
  }
  flush()
  return out
}
