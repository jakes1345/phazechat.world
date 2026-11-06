import type { NexusMessage, TurnConfig } from './nexusTypes'

interface Props {
  me: string
  channelId: string
  channelName: string
  send: (m: NexusMessage) => void
  subscribe: (handler: (m: NexusMessage) => void) => () => void
  turn: TurnConfig | null
  /** A ready-made call URL carrying the era's call controls. Spaces voice
   *  channels leave it out and get a plain room. */
  src?: string
}

export default function VoiceRoom({ channelId, channelName, src }: Props) {
  const room = channelId.replace(/[^a-zA-Z0-9_-]/g, '-')
  return (
    <div className="voice-room">
      <header className="voice-head">
        <h2><span className="hash">🎙</span>{channelName}</h2>
      </header>
      <iframe
        src={src ?? `https://meet.jit.si/${room}`}
        allow="camera; microphone; display-capture; fullscreen"
        style={{ width: '100%', flex: 1, border: 'none', minHeight: 400 }}
        title={channelName}
      />
    </div>
  )
}
