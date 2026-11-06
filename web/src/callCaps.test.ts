import { describe, expect, it } from 'vitest'
import { groupCallCaps } from './callCaps'

describe('group call controls per era', () => {
  it('first era: voice only, no screen sharing, even for a video call', () => {
    expect(groupCallCaps('skype3', 'video')).toEqual({ allowVideo: false, allowScreenShare: false, startWithCamera: false })
  })
  it('screen sharing arrives before group video', () => {
    expect(groupCallCaps('skype4', 'audio')).toEqual({ allowVideo: false, allowScreenShare: true, startWithCamera: false })
  })
  it('group video era: camera offered, on at the start of a video call only', () => {
    expect(groupCallCaps('skype5', 'video')).toEqual({ allowVideo: true, allowScreenShare: true, startWithCamera: true })
    expect(groupCallCaps('skype5', 'audio').startWithCamera).toBe(false)
  })
  it('modern era has everything', () => {
    expect(groupCallCaps('skype8', 'video').allowVideo).toBe(true)
  })
})
