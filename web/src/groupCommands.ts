/** Classic Skype group-chat slash commands (P2P-era chats, Skype 3-7).
 *
 *  Sourced in docs/skype-eras/skype6.md (Presence and messaging): /add,
 *  /kick, /setrole, /leave, /showmembers, /topic, /alertsoff, /me. Every
 *  command here maps onto group management the server already enforces
 *  (convo_rename, convo_add_member, convo_remove_member, convo_leave), so
 *  the checks below only decide what to *say* locally — the server stays
 *  the authority. /setrole is left out on purpose: Phaze groups only have
 *  a creator and members, so there are no roles to set.
 *
 *  Pure: no React, no I/O. GroupChat turns the result into an action. */

export type GroupCommandContext = {
  me: string
  /** Empty until the server has told us — treated as "nobody is admin". */
  creator: string
  members: string[]
  friends: string[]
}

export type GroupCommandResult =
  | { kind: 'send'; text: string }
  | { kind: 'rename'; name: string }
  | { kind: 'add'; users: string[]; notice?: string }
  | { kind: 'kick'; user: string }
  | { kind: 'leave' }
  | { kind: 'alerts'; on: boolean }
  /** Shown only to the person who typed it; nothing is sent. */
  | { kind: 'notice'; text: string }

export const GROUP_COMMANDS: { cmd: string; usage: string; desc: string }[] = [
  { cmd: '/topic', usage: '/topic <name>', desc: 'rename the group (creator only)' },
  { cmd: '/add', usage: '/add <username> [username…]', desc: 'add friends to the group' },
  { cmd: '/kick', usage: '/kick <username>', desc: 'remove someone (creator only)' },
  { cmd: '/leave', usage: '/leave', desc: 'leave the group' },
  { cmd: '/showmembers', usage: '/showmembers', desc: 'list members and their roles' },
  { cmd: '/me', usage: '/me <action>', desc: 'send an action line' },
  { cmd: '/alertsoff', usage: '/alertsoff', desc: 'stop sounds for this group' },
  { cmd: '/alertson', usage: '/alertson', desc: 'turn this group\'s sounds back on' },
  { cmd: '/help', usage: '/help', desc: 'show this list' },
]

const TOPIC_MAX = 100

export function runGroupCommand(input: string, ctx: GroupCommandContext): GroupCommandResult {
  const text = input.trim()
  if (!text.startsWith('/')) return { kind: 'send', text }

  const space = text.indexOf(' ')
  const head = (space === -1 ? text : text.slice(0, space)).toLowerCase()
  const rest = space === -1 ? '' : text.slice(space + 1).trim()
  const iAmCreator = ctx.me !== '' && ctx.me === ctx.creator
  const creatorName = ctx.creator || 'the creator'

  switch (head) {
    case '/me':
      if (!rest) return { kind: 'notice', text: 'Usage: /me <action>' }
      return { kind: 'send', text: `*${rest}*` }

    case '/topic':
      if (!iAmCreator) return { kind: 'notice', text: `Only ${creatorName} can change the topic.` }
      if (!rest) return { kind: 'notice', text: 'Usage: /topic <name>' }
      return { kind: 'rename', name: rest.slice(0, TOPIC_MAX) }

    case '/add': {
      const asked = [...new Set(rest.split(/[\s,]+/).filter(Boolean))]
      if (asked.length === 0) return { kind: 'notice', text: 'Usage: /add <username> [username…]' }
      const already = asked.filter((u) => ctx.members.includes(u))
      const notFriends = asked.filter((u) => !ctx.members.includes(u) && !ctx.friends.includes(u))
      const users = asked.filter((u) => !ctx.members.includes(u) && ctx.friends.includes(u))
      const problems = [
        already.length ? `already here: ${already.join(', ')}` : '',
        // Same friends-only rule the server applies to convo_add_member.
        notFriends.length ? `not in your contacts: ${notFriends.join(', ')}` : '',
      ].filter(Boolean).join('; ')
      if (users.length === 0) return { kind: 'notice', text: `Nobody added — ${problems}.` }
      return problems ? { kind: 'add', users, notice: `Skipped — ${problems}.` } : { kind: 'add', users }
    }

    case '/kick': {
      if (!iAmCreator) return { kind: 'notice', text: `Only ${creatorName} can remove people.` }
      const user = rest.split(/\s+/)[0] ?? ''
      if (!user) return { kind: 'notice', text: 'Usage: /kick <username>' }
      if (user === ctx.me) return { kind: 'notice', text: 'Use /leave to leave the group yourself.' }
      if (!ctx.members.includes(user)) return { kind: 'notice', text: `${user} isn't in this group.` }
      return { kind: 'kick', user }
    }

    case '/leave':
      return { kind: 'leave' }

    case '/showmembers': {
      // Real Skype printed each member with an uppercase role name.
      const rows = ctx.members.map((m) => `${m} — ${m === ctx.creator ? 'CREATOR' : 'USER'}`)
      return { kind: 'notice', text: `Members (${ctx.members.length}):\n${rows.join('\n')}` }
    }

    case '/alertsoff':
      return { kind: 'alerts', on: false }
    case '/alertson':
      return { kind: 'alerts', on: true }

    case '/help':
      return { kind: 'notice', text: GROUP_COMMANDS.map((c) => `${c.usage} — ${c.desc}`).join('\n') }

    default:
      return { kind: 'notice', text: `Unknown command ${head}. Type /help for the list.` }
  }
}

/** Per-device list of group ids whose message sounds are muted (/alertsoff).
 *  Local only, like real Skype's per-chat alert setting; storage can be
 *  unavailable (private windows), so every access is guarded. */
const MUTED_KEY = 'phaze_muted_convos_v1'

export function loadMutedConvos(): Set<string> {
  try {
    const raw = localStorage.getItem(MUTED_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

export function saveMutedConvos(ids: Set<string>): void {
  try {
    localStorage.setItem(MUTED_KEY, JSON.stringify([...ids]))
  } catch {
    // Storage unavailable — the mute still applies for this session.
  }
}
