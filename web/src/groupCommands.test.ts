import { describe, expect, it } from 'vitest'
import { runGroupCommand, type GroupCommandContext } from './groupCommands'

const creatorCtx: GroupCommandContext = {
  me: 'alice',
  creator: 'alice',
  members: ['alice', 'bob'],
  friends: ['bob', 'carol', 'dave'],
}
const memberCtx: GroupCommandContext = { ...creatorCtx, me: 'bob' }

describe('runGroupCommand', () => {
  it('passes plain text through as a message', () => {
    expect(runGroupCommand('  hello  ', creatorCtx)).toEqual({ kind: 'send', text: 'hello' })
  })

  it('/me sends an action line, and needs an action', () => {
    expect(runGroupCommand('/me waves', memberCtx)).toEqual({ kind: 'send', text: '*waves*' })
    expect(runGroupCommand('/me', memberCtx).kind).toBe('notice')
  })

  it('/topic renames for the creator only', () => {
    expect(runGroupCommand('/topic Weekend plans', creatorCtx)).toEqual({ kind: 'rename', name: 'Weekend plans' })
    expect(runGroupCommand('/topic Hijacked', memberCtx)).toEqual({ kind: 'notice', text: 'Only alice can change the topic.' })
    expect(runGroupCommand('/topic', creatorCtx).kind).toBe('notice')
  })

  it('/topic caps the name at the server limit', () => {
    const r = runGroupCommand(`/topic ${'x'.repeat(150)}`, creatorCtx)
    expect(r.kind === 'rename' && r.name.length).toBe(100)
  })

  it('/add only adds friends who are not already in the group', () => {
    expect(runGroupCommand('/add carol dave', memberCtx)).toEqual({ kind: 'add', users: ['carol', 'dave'] })
    expect(runGroupCommand('/add carol bob mallory', memberCtx)).toEqual({
      kind: 'add', users: ['carol'], notice: 'Skipped — already here: bob; not in your contacts: mallory.',
    })
    expect(runGroupCommand('/add mallory', memberCtx).kind).toBe('notice')
    expect(runGroupCommand('/add', memberCtx).kind).toBe('notice')
  })

  it('/kick is creator-only and only targets other members', () => {
    expect(runGroupCommand('/kick bob', creatorCtx)).toEqual({ kind: 'kick', user: 'bob' })
    expect(runGroupCommand('/kick alice', memberCtx).kind).toBe('notice')
    expect(runGroupCommand('/kick alice', creatorCtx)).toEqual({ kind: 'notice', text: 'Use /leave to leave the group yourself.' })
    expect(runGroupCommand('/kick carol', creatorCtx)).toEqual({ kind: 'notice', text: "carol isn't in this group." })
  })

  it('treats an unknown creator as "nobody is admin" rather than guessing', () => {
    const noCreator = { ...creatorCtx, creator: '' }
    expect(runGroupCommand('/topic x', noCreator)).toEqual({ kind: 'notice', text: 'Only the creator can change the topic.' })
  })

  it('/showmembers lists roles the way Skype printed them', () => {
    expect(runGroupCommand('/showmembers', memberCtx)).toEqual({
      kind: 'notice', text: 'Members (2):\nalice — CREATOR\nbob — USER',
    })
  })

  it('/leave, /alertsoff, /alertson', () => {
    expect(runGroupCommand('/leave', memberCtx)).toEqual({ kind: 'leave' })
    expect(runGroupCommand('/alertsoff', memberCtx)).toEqual({ kind: 'alerts', on: false })
    expect(runGroupCommand('/ALERTSON', memberCtx)).toEqual({ kind: 'alerts', on: true })
  })

  it('never sends an unknown command as a message', () => {
    expect(runGroupCommand('/settopic x', memberCtx)).toEqual({
      kind: 'notice', text: 'Unknown command /settopic. Type /help for the list.',
    })
  })
})
