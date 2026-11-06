import { describe, expect, it } from 'vitest'
import { callPhaseText, iceServersFor, mediaConstraints, mediaErrorMessage } from './peerCall'

describe('iceServersFor', () => {
  it('always offers STUN and adds the TURN relay when the server sent one', () => {
    expect(iceServersFor(null)).toHaveLength(1)
    const servers = iceServersFor({ url: 'turn:turn.example:3478', urls: ['turns:turn.example:5349'], username: 'u', password: 'p' })
    expect(servers).toHaveLength(2)
    expect(servers[1]).toEqual({ urls: ['turn:turn.example:3478', 'turns:turn.example:5349'], username: 'u', credential: 'p' })
  })
})

describe('mediaConstraints', () => {
  it('asks for the camera only on video calls', () => {
    expect(mediaConstraints('audio').video).toBe(false)
    expect(mediaConstraints('video').video).toBeTruthy()
    expect(mediaConstraints('audio').audio).toBeTruthy()
  })
})

describe('mediaErrorMessage', () => {
  it('names what is missing in plain words', () => {
    expect(mediaErrorMessage({ name: 'NotAllowedError' }, 'video')).toMatch(/permission.*camera and microphone/)
    expect(mediaErrorMessage({ name: 'NotFoundError' }, 'audio')).toMatch(/No microphone/)
    expect(mediaErrorMessage({ name: 'NotReadableError' }, 'audio')).toMatch(/in use/)
  })
})

describe('callPhaseText', () => {
  it('shows progress until connected', () => {
    expect(callPhaseText('connecting')).toBe('connecting…')
    expect(callPhaseText('connected')).toBeNull()
  })
})
