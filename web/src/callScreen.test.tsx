import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CallScreen } from './CallScreen'

const noop = () => {}
const render = (type: 'audio' | 'video', status: 'ringing' | 'active') => renderToStaticMarkup(
  <CallScreen
    state={{ peer: 'ana', type, status, direction: 'outgoing' }}
    media={null}
    seconds={65}
    avatarBg="#123"
    onAnswer={noop}
    onHangUp={noop}
    onToggleMute={noop}
    onToggleCamera={noop}
  />,
)

describe('call screen', () => {
  it('carries a window title that the framed eras show', () => {
    expect(render('audio', 'ringing')).toContain('Call with ana')
    expect(render('video', 'active')).toContain('Video call with ana')
  })

  it('shows the running time once the call is active', () => {
    expect(render('audio', 'active')).toContain('01:05')
  })
})
