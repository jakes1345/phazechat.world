/** Mirrors `NexusMessage` in nexus_server/main.go (JSON field names). */

export interface TurnConfig {
  url: string
  urls?: string[]
  username: string
  password: string
}

export interface NexusMessage {
  type: string
  sender?: string
  recipient?: string
  body?: string
  status?: string
  results?: string[]
  sdp?: string
  candidate?: string
  room_id?: string
  token?: string
  error?: string
  email?: string
  mood?: string
  display_name?: string
  convo_id?: string
  convo_name?: string
  members?: string[]
  /** Who made the group — the only capability boundary group chats have.
   *  Sent on convo_info/convo_created/convo_updated so the client can show
   *  remove/rename controls only to the one person they'll actually work
   *  for. */
  creator?: string
  /** contact -> group name the current user has filed that contact under
   *  in their own contact list (e.g. "Family", "Work"). Sent as a full
   *  map, never incrementally — see contact_group_set / contact_groups
   *  in nexus_server/ws_handlers.go. */
  contact_groups?: Record<string, string>
  turn_config?: TurnConfig
  totp_code?: string
  totp_uri?: string
  qr_token?: string
  qr_data?: string
  device_info?: string
  /** unix-ms timestamp — last DM activity on friend_status, call start on call_log */
  ts?: number
  /** call length in seconds, present on call_log */
  duration?: number
  envelopes?: Record<string, string>
  /** Go JSON encodes []byte as base64 string */
  public_key?: string | number[]
  key_fingerprint?: string

  // ---- Servers + Channels ("Spaces") ----
  server_id?: string
  channel_id?: string
  server_name?: string
  channel_name?: string
  topic?: string
  kind?: 'text' | 'voice' | 'whiteboard'
  role?: 'owner' | 'admin' | 'member'
  visibility?: 'public' | 'private'
  invite_code?: string
  servers?: ServerSummary[]
  channels?: ChannelInfo[]
  messages?: ChannelMsg[]
  history_from?: number

  // Edit / delete / react support — see NexusMessage in nexus_server/main.go.
  msg_id?: string
  reaction?: string

  // Durable DM history response (dm_history).
  dm_history?: DMMessage[]

  // Phone linking
  phone?: string

  // Referral tracking
  ref_by?: string

  // New-device verification. challenge_id identifies a sign-in awaiting
  // approval; device_id is the browser/install it came from. On an inbound
  // device_challenge, `body` is the human-readable device label and `status`
  // carries the IP.
  challenge_id?: number
  device_id?: string

  // Whiteboard. `stroke` is one mark as JSON; `strokes` is a whole board,
  // replayed in order on join. `stroke_id` identifies a stroke for undo.
  stroke?: string
  strokes?: string[]
  stroke_id?: number
  stroke_uid?: string

  // PIN-encrypted NaCl keypair backup blob (key_backup_put / key_backup).
  key_backup?: KeyBackup

  // One-time TOTP recovery codes, returned once on 2FA enable.
  backup_codes?: string[]
}

export interface KeyBackup {
  ciphertext: string
  salt: string
  iterations: number
  created_at?: string
}

export interface DMMessage {
  msg_id: string
  sender: string
  recipient: string
  body: string
  edited?: boolean
  deleted?: boolean
  created_at: string
  reactions?: Record<string, string[]>
}

export interface ServerSummary {
  id: string
  name: string
  description?: string
  icon?: string
  owner: string
  visibility: 'public' | 'private'
  role: 'owner' | 'admin' | 'member'
  invite_code?: string
  member_count?: number
  is_member?: boolean
}

export interface ChannelInfo {
  id: string
  server_id: string
  name: string
  topic?: string
  kind: 'text' | 'voice' | 'whiteboard'
  position: number
}

export interface ChannelMsg {
  id: number
  channel_id: string
  sender: string
  body: string
  created_at: string
  edited?: boolean
  deleted?: boolean
  pinned?: boolean
  reactions?: Record<string, string[]>
}
