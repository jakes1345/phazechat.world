import './call.css'

type CallState = {
  peer: string
  type: 'audio' | 'video'
  status: 'ringing' | 'active'
  direction: 'outgoing' | 'incoming'
}

export function CallScreen({ state, jitsiUrl, avatarBg, onAnswer, onHangUp }: {
  state: CallState
  jitsiUrl: string | null
  avatarBg: string
  onAnswer: () => void
  onHangUp: () => void
}) {
  const ringing = state.status === 'ringing'
  return (
    <div className="call7">
      <span className="call7-mark">phaze</span>
      {ringing || !jitsiUrl ? (
        <div className="call7-center">
          <span className="call7-avatar" style={{ background: avatarBg }}>
            {state.peer[0]?.toUpperCase()}
          </span>
          <div className="call7-name">{state.peer}</div>
          <div className="call7-state">
            {ringing && state.direction === 'outgoing' && <>calling<span className="call7-dots"><i>.</i><i>.</i><i>.</i></span></>}
            {ringing && state.direction === 'incoming' && `incoming ${state.type} call`}
            {!ringing && 'connecting…'}
          </div>
        </div>
      ) : (
        <iframe className="call7-jitsi" src={jitsiUrl} allow="camera; microphone; fullscreen; display-capture" title="call" />
      )}
      <div className="call7-bar">
        {ringing && state.direction === 'incoming' && (
          <button type="button" className="call7-answer" onClick={onAnswer} title="Answer">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="#fff"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.4.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.4c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1l-2.2 2.2z"/></svg>
          </button>
        )}
        <button type="button" className="call7-hangup" onClick={onHangUp} title={ringing && state.direction === 'incoming' ? 'Decline' : 'Hang up'}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="#fff"><path d="M12 9c-2.9 0-5.6.6-8 1.7-.6.3-1 .9-1 1.6v2.3c0 .6.4 1 1 1h3c.6 0 1-.4 1-1v-1.6c1.3-.4 2.6-.6 4-.6s2.7.2 4 .6V14c0 .6.4 1 1 1h3c.6 0 1-.4 1-1v-2.3c0-.7-.4-1.3-1-1.6C17.6 9.6 14.9 9 12 9z"/></svg>
        </button>
      </div>
    </div>
  )
}
