export type Token =
  | { kind: 'text'; value: string }
  | { kind: 'emoticon'; id: string; shortcut: string }

/** Real Skype's classic set — the twenty this app originally shipped with,
 *  each with a hand-drawn face in emoticonArt.tsx. Unchanged; every later
 *  addition below falls back to a plain Unicode glyph instead (see
 *  emoticonArt.tsx's `Emoticon` component), so this list is the only one
 *  that needs bespoke art. */
const CLASSIC = [
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

/** A much larger set of everyday faces, gestures and objects, in the same
 *  parenthesis-shortcode style classic messenger apps used. These render via
 *  the plain-glyph fallback in emoticonArt.tsx (a Unicode character, drawn
 *  by nobody's art department) rather than bespoke house-style art — adding
 *  hand-drawn faces for all of them would be a lot of art, not a research
 *  claim, so it's left for later rather than rushed.
 *
 *  A handful of ids carry a comment citing docs/skype-eras/ because the
 *  research pass found real Skype shipped a shortcode of that exact name
 *  at a specific version; everything else here is a generically useful
 *  expansion, not a sourced historical claim — don't cite these as if the
 *  research verified all of them, because it didn't. */
const EXTRA = [
  // Faces
  { id: 'grin', shortcuts: ['(grin)', 'xD'], emoji: '😁', label: 'Grinning' },
  { id: 'neutral', shortcuts: ['(neutral)', ':-|', ':|'], emoji: '😐', label: 'Neutral' },
  { id: 'confused', shortcuts: ['(confused)', ':-/', ':/'], emoji: '😕', label: 'Confused' },
  { id: 'worried', shortcuts: ['(worried)'], emoji: '😟', label: 'Worried' },
  { id: 'shocked', shortcuts: ['(shocked)'], emoji: '😱', label: 'Shocked' },
  { id: 'doh', shortcuts: ['(doh)', '(facepalm)', '(fail)'], emoji: '🤦', label: 'Facepalm' },
  { id: 'rofl', shortcuts: ['(rofl)', '(lol)'], emoji: '🤣', label: 'Rolling on the floor laughing' },
  { id: 'smirk', shortcuts: ['(smirk)'], emoji: '😏', label: 'Smirk' },
  { id: 'nerd', shortcuts: ['(nerd)'], emoji: '🤓', label: 'Nerd' },
  { id: 'sick', shortcuts: ['(sick)', '(ill)'], emoji: '🤒', label: 'Sick' },
  { id: 'inlove', shortcuts: ['(inlove)', '(love)'], emoji: '😍', label: 'In love' },
  { id: 'devil', shortcuts: ['(devil)'], emoji: '😈', label: 'Devil' },
  { id: 'angel', shortcuts: ['(angel)'], emoji: '😇', label: 'Angel' },
  { id: 'yawn', shortcuts: ['(yawn)'], emoji: '🥱', label: 'Yawning' },
  { id: 'puke', shortcuts: ['(puke)', '(sick2)'], emoji: '🤮', label: 'Vomiting' },
  { id: 'dizzy', shortcuts: ['(dizzy)'], emoji: '😵', label: 'Dizzy' },
  { id: 'zip', shortcuts: ['(zip)', '(secret)'], emoji: '🤐', label: 'Zip it' },
  { id: 'wasntme', shortcuts: ['(wasntme)'], emoji: '😬', label: "Wasn't me" },
  { id: 'shame', shortcuts: ['(shame)'], emoji: '😳', label: 'Embarrassed' },
  { id: 'mmm', shortcuts: ['(mmm)', '(yum)'], emoji: '😋', label: 'Yum' },
  // Sourced hidden emoticon: (oliver) debuted 5.9 (2011) — see
  // docs/skype-era-research.md's emoticons appendix. No description of the
  // original art survives in any source read, so this is a generic
  // stand-in glyph, not a recreation of it.
  { id: 'oliver', shortcuts: ['(oliver)'], emoji: '👦', label: 'Oliver' },
  // Sourced hidden emoticon: (soccer) debuted 5.9 (2011) — same appendix.
  { id: 'soccer', shortcuts: ['(soccer)'], emoji: '⚽', label: 'Soccer' },
  // Sourced: skype5.md's Skype 5.5 hidden-emoticon set.
  { id: 'wfh', shortcuts: ['(wfh)'], emoji: '🏠', label: 'Working from home' },
  { id: 'fingerscrossed', shortcuts: ['(fingers)', '(fingerscrossed)', '(yn)'], emoji: '🤞', label: 'Fingers crossed' },
  { id: 'tumbleweed', shortcuts: ['(tumbleweed)'], emoji: '🌾', label: 'Tumbleweed' },
  { id: 'lalala', shortcuts: ['(lalala)', '(lala)', '(notlistening)'], emoji: '🙉', label: 'Not listening' },
  { id: 'waiting', shortcuts: ['(waiting)', '(forever)', '(impatience)'], emoji: '⏳', label: 'Waiting' },
  { id: 'highfive', shortcuts: ['(highfive)', '(hifive)', '(h5)'], emoji: '🙌', label: 'High five' },
  // Sourced: skype6.md's Skype 6.14 hidden-emoticon batch (animal-themed
  // half survived past 6.20; the Marvel-named half is mapped to a neutral
  // glyph below rather than any character likeness — a shortcode is just a
  // word, but drawing the character it references would not be).
  { id: 'dog', shortcuts: ['(dog)'], emoji: '🐶', label: 'Dog' },
  { id: 'cat', shortcuts: ['(cat)'], emoji: '🐱', label: 'Cat' },
  { id: 'sheep', shortcuts: ['(sheep)'], emoji: '🐑', label: 'Sheep' },
  { id: 'bike', shortcuts: ['(bike)'], emoji: '🚲', label: 'Bike' },
  { id: 'idea', shortcuts: ['(idea)'], emoji: '💡', label: 'Idea' },
  { id: 'talktothehand', shortcuts: ['(talktothehand)'], emoji: '🤚', label: 'Talk to the hand' },
  { id: 'shielddeflect', shortcuts: ['(shielddeflect)'], emoji: '🛡️', label: 'Shield' },
  { id: 'redagent', shortcuts: ['(blackwidow)'], emoji: '🕸️', label: 'Web' },
  { id: 'saluteagent', shortcuts: ['(captain)'], emoji: '🫡', label: 'Salute' },
  { id: 'shadesagent', shortcuts: ['(nickfury)'], emoji: '🕶️', label: 'Sunglasses' },
  { id: 'metalarm', shortcuts: ['(bucky)'], emoji: '🦾', label: 'Mechanical arm' },
  // Sourced: docs/skype-era-research.md notes these were present from
  // Skype 2.5/3.0 onward and had "a distinctly adult sense of humour."
  { id: 'drunk', shortcuts: ['(drunk)'], emoji: '🥴', label: 'Drunk' },
  { id: 'smoking', shortcuts: ['(smoking)'], emoji: '🚬', label: 'Smoking' },
  { id: 'mooning', shortcuts: ['(mooning)'], emoji: '🍑', label: 'Mooning' },
  { id: 'headbang', shortcuts: ['(headbang)'], emoji: '🤕', label: 'Headbang' },
  { id: 'bug', shortcuts: ['(bug)'], emoji: '🐛', label: 'Bug' },
  { id: 'fubar', shortcuts: ['(fubar)'], emoji: '💥', label: 'FUBAR' },
  // Gestures / people
  { id: 'clap', shortcuts: ['(clap)', '(clapping)'], emoji: '👏', label: 'Clapping' },
  { id: 'punch', shortcuts: ['(punch)'], emoji: '👊', label: 'Punch' },
  { id: 'muscle', shortcuts: ['(muscle)', '(strong)'], emoji: '💪', label: 'Muscle' },
  { id: 'pray', shortcuts: ['(pray)'], emoji: '🙏', label: 'Praying' },
  { id: 'ok', shortcuts: ['(ok)'], emoji: '👌', label: 'OK' },
  { id: 'wait', shortcuts: ['(wait)'], emoji: '✋', label: 'Wait' },
  { id: 'point', shortcuts: ['(point)'], emoji: '👉', label: 'Point' },
  { id: 'bow', shortcuts: ['(bow)'], emoji: '🙇', label: 'Bow' },
  { id: 'dance', shortcuts: ['(dance)'], emoji: '💃', label: 'Dance' },
  { id: 'rock', shortcuts: ['(rock)', '(metal)'], emoji: '🤘', label: 'Rock on' },
  { id: 'call', shortcuts: ['(call)'], emoji: '🤙', label: 'Call me' },
  { id: 'shrug', shortcuts: ['(shrug)'], emoji: '🤷', label: 'Shrug' },
  { id: 'wtf', shortcuts: ['(wtf)', '(swear)'], emoji: '🤬', label: 'Swearing' },
  { id: 'ninja', shortcuts: ['(ninja)'], emoji: '🥷', label: 'Ninja' },
  { id: 'ghost', shortcuts: ['(boo)', '(ghost)'], emoji: '👻', label: 'Ghost' },
  { id: 'skull', shortcuts: ['(skull)', '(dead)'], emoji: '💀', label: 'Skull' },
  { id: 'alien', shortcuts: ['(alien)'], emoji: '👽', label: 'Alien' },
  { id: 'robot', shortcuts: ['(robot)', '(bot)'], emoji: '🤖', label: 'Robot' },
  { id: 'clown', shortcuts: ['(clown)'], emoji: '🤡', label: 'Clown' },
  // Weather / nature
  { id: 'sun', shortcuts: ['(sun)'], emoji: '☀️', label: 'Sun' },
  { id: 'moon', shortcuts: ['(moon)'], emoji: '🌙', label: 'Moon' },
  { id: 'star', shortcuts: ['(star)'], emoji: '⭐', label: 'Star' },
  { id: 'rain', shortcuts: ['(rain)'], emoji: '🌧️', label: 'Rain' },
  { id: 'storm', shortcuts: ['(storm)'], emoji: '⛈️', label: 'Storm' },
  { id: 'snow', shortcuts: ['(snow)'], emoji: '❄️', label: 'Snow' },
  { id: 'rainbow', shortcuts: ['(rainbow)'], emoji: '🌈', label: 'Rainbow' },
  { id: 'fire', shortcuts: ['(fire)'], emoji: '🔥', label: 'Fire' },
  { id: 'flower', shortcuts: ['(flower)', '(rose)'], emoji: '🌹', label: 'Rose' },
  { id: 'fourleaf', shortcuts: ['(luck)', '(clover)'], emoji: '🍀', label: 'Four-leaf clover' },
  // Objects
  { id: 'coffee', shortcuts: ['(coffee)'], emoji: '☕', label: 'Coffee' },
  { id: 'beer', shortcuts: ['(beer)'], emoji: '🍺', label: 'Beer' },
  { id: 'wine', shortcuts: ['(wine)'], emoji: '🍷', label: 'Wine' },
  { id: 'cake', shortcuts: ['(cake)'], emoji: '🎂', label: 'Cake' },
  { id: 'pizza', shortcuts: ['(pizza)'], emoji: '🍕', label: 'Pizza' },
  { id: 'gift', shortcuts: ['(gift)'], emoji: '🎁', label: 'Gift' },
  { id: 'cash', shortcuts: ['(cash)', '(money)'], emoji: '💵', label: 'Money' },
  { id: 'mail', shortcuts: ['(mail)', '(email)'], emoji: '✉️', label: 'Mail' },
  { id: 'phonecall', shortcuts: ['(telephone)', '(phone)'], emoji: '📞', label: 'Phone' },
  { id: 'movie', shortcuts: ['(movie)', '(film)'], emoji: '🎬', label: 'Movie' },
  { id: 'music', shortcuts: ['(music)'], emoji: '🎵', label: 'Music' },
  { id: 'camera', shortcuts: ['(camera)'], emoji: '📷', label: 'Camera' },
  { id: 'clock', shortcuts: ['(clock)', '(time)'], emoji: '🕐', label: 'Clock' },
  { id: 'lightbulb', shortcuts: ['(bulb)'], emoji: '💡', label: 'Lightbulb' },
  { id: 'key', shortcuts: ['(key)'], emoji: '🔑', label: 'Key' },
  { id: 'trophy', shortcuts: ['(trophy)', '(win)'], emoji: '🏆', label: 'Trophy' },
  { id: 'bomb', shortcuts: ['(bomb)'], emoji: '💣', label: 'Bomb' },
  { id: 'umbrella', shortcuts: ['(umbrella)'], emoji: '☂️', label: 'Umbrella' },
  { id: 'balloon', shortcuts: ['(balloon)'], emoji: '🎈', label: 'Balloon' },
  { id: 'present', shortcuts: ['(present)'], emoji: '🎉', label: 'Celebration' },
  { id: 'pumpkin', shortcuts: ['(pumpkin)'], emoji: '🎃', label: 'Pumpkin' },
  { id: 'tree', shortcuts: ['(xmastree)', '(tree)'], emoji: '🎄', label: 'Christmas tree' },
  { id: 'snowman', shortcuts: ['(snowman)'], emoji: '☃️', label: 'Snowman' },
] as const

/** Country flags, `(flag:xx)` where xx is a two-letter ISO 3166-1 code —
 *  the exact format real Skype used. Not a Skype-specific asset: the flag
 *  glyph is rendered by the system font from two Unicode regional-indicator
 *  characters, computed from the code below rather than drawn by anyone.
 *  Covers current UN member/observer states plus a few widely-used
 *  dependent-territory codes; not a claim that this exact 190-odd-entry
 *  list matches the ~237 Skype is documented to have shipped historically
 *  (docs/skype-era-research.md) — nobody read a source enumerating all of
 *  those by name, so this is today's ISO list, not a period reproduction. */
function flagEmoji(code: string): string {
  const cc = code.toUpperCase()
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}

const COUNTRIES: [code: string, name: string][] = [
  ['ad', 'Andorra'], ['ae', 'United Arab Emirates'], ['af', 'Afghanistan'], ['ag', 'Antigua and Barbuda'],
  ['ai', 'Anguilla'], ['al', 'Albania'], ['am', 'Armenia'], ['ao', 'Angola'], ['ar', 'Argentina'],
  ['as', 'American Samoa'], ['at', 'Austria'], ['au', 'Australia'], ['aw', 'Aruba'], ['az', 'Azerbaijan'],
  ['ba', 'Bosnia and Herzegovina'], ['bb', 'Barbados'], ['bd', 'Bangladesh'], ['be', 'Belgium'],
  ['bf', 'Burkina Faso'], ['bg', 'Bulgaria'], ['bh', 'Bahrain'], ['bi', 'Burundi'], ['bj', 'Benin'],
  ['bm', 'Bermuda'], ['bn', 'Brunei'], ['bo', 'Bolivia'], ['br', 'Brazil'], ['bs', 'Bahamas'],
  ['bt', 'Bhutan'], ['bw', 'Botswana'], ['by', 'Belarus'], ['bz', 'Belize'], ['ca', 'Canada'],
  ['cd', 'DR Congo'], ['cf', 'Central African Republic'], ['cg', 'Congo'], ['ch', 'Switzerland'],
  ['ci', "Ivory Coast"], ['cl', 'Chile'], ['cm', 'Cameroon'], ['cn', 'China'], ['co', 'Colombia'],
  ['cr', 'Costa Rica'], ['cu', 'Cuba'], ['cv', 'Cape Verde'], ['cy', 'Cyprus'], ['cz', 'Czechia'],
  ['de', 'Germany'], ['dj', 'Djibouti'], ['dk', 'Denmark'], ['dm', 'Dominica'], ['do', 'Dominican Republic'],
  ['dz', 'Algeria'], ['ec', 'Ecuador'], ['ee', 'Estonia'], ['eg', 'Egypt'], ['er', 'Eritrea'],
  ['es', 'Spain'], ['et', 'Ethiopia'], ['fi', 'Finland'], ['fj', 'Fiji'], ['fk', 'Falkland Islands'],
  ['fm', 'Micronesia'], ['fo', 'Faroe Islands'], ['fr', 'France'], ['ga', 'Gabon'], ['gb', 'United Kingdom'],
  ['gd', 'Grenada'], ['ge', 'Georgia'], ['gf', 'French Guiana'], ['gg', 'Guernsey'], ['gh', 'Ghana'],
  ['gi', 'Gibraltar'], ['gl', 'Greenland'], ['gm', 'Gambia'], ['gn', 'Guinea'], ['gp', 'Guadeloupe'],
  ['gq', 'Equatorial Guinea'], ['gr', 'Greece'], ['gt', 'Guatemala'], ['gu', 'Guam'], ['gw', 'Guinea-Bissau'],
  ['gy', 'Guyana'], ['hk', 'Hong Kong'], ['hn', 'Honduras'], ['hr', 'Croatia'], ['ht', 'Haiti'],
  ['hu', 'Hungary'], ['id', 'Indonesia'], ['ie', 'Ireland'], ['il', 'Israel'], ['im', 'Isle of Man'],
  ['in', 'India'], ['iq', 'Iraq'], ['ir', 'Iran'], ['is', 'Iceland'], ['it', 'Italy'], ['je', 'Jersey'],
  ['jm', 'Jamaica'], ['jo', 'Jordan'], ['jp', 'Japan'], ['ke', 'Kenya'], ['kg', 'Kyrgyzstan'],
  ['kh', 'Cambodia'], ['ki', 'Kiribati'], ['km', 'Comoros'], ['kn', 'Saint Kitts and Nevis'],
  ['kp', 'North Korea'], ['kr', 'South Korea'], ['kw', 'Kuwait'], ['ky', 'Cayman Islands'],
  ['kz', 'Kazakhstan'], ['la', 'Laos'], ['lb', 'Lebanon'], ['lc', 'Saint Lucia'], ['li', 'Liechtenstein'],
  ['lk', 'Sri Lanka'], ['lr', 'Liberia'], ['ls', 'Lesotho'], ['lt', 'Lithuania'], ['lu', 'Luxembourg'],
  ['lv', 'Latvia'], ['ly', 'Libya'], ['ma', 'Morocco'], ['mc', 'Monaco'], ['md', 'Moldova'],
  ['me', 'Montenegro'], ['mg', 'Madagascar'], ['mh', 'Marshall Islands'], ['mk', 'North Macedonia'],
  ['ml', 'Mali'], ['mm', 'Myanmar'], ['mn', 'Mongolia'], ['mo', 'Macau'], ['mp', 'Northern Mariana Islands'],
  ['mq', 'Martinique'], ['mr', 'Mauritania'], ['ms', 'Montserrat'], ['mt', 'Malta'], ['mu', 'Mauritius'],
  ['mv', 'Maldives'], ['mw', 'Malawi'], ['mx', 'Mexico'], ['my', 'Malaysia'], ['mz', 'Mozambique'],
  ['na', 'Namibia'], ['nc', 'New Caledonia'], ['ne', 'Niger'], ['nf', 'Norfolk Island'], ['ng', 'Nigeria'],
  ['ni', 'Nicaragua'], ['nl', 'Netherlands'], ['no', 'Norway'], ['np', 'Nepal'], ['nr', 'Nauru'],
  ['nu', 'Niue'], ['nz', 'New Zealand'], ['om', 'Oman'], ['pa', 'Panama'], ['pe', 'Peru'],
  ['pf', 'French Polynesia'], ['pg', 'Papua New Guinea'], ['ph', 'Philippines'], ['pk', 'Pakistan'],
  ['pl', 'Poland'], ['pm', 'Saint Pierre and Miquelon'], ['pr', 'Puerto Rico'], ['ps', 'Palestine'],
  ['pt', 'Portugal'], ['pw', 'Palau'], ['py', 'Paraguay'], ['qa', 'Qatar'], ['re', 'Réunion'],
  ['ro', 'Romania'], ['rs', 'Serbia'], ['ru', 'Russia'], ['rw', 'Rwanda'], ['sa', 'Saudi Arabia'],
  ['sb', 'Solomon Islands'], ['sc', 'Seychelles'], ['sd', 'Sudan'], ['se', 'Sweden'], ['sg', 'Singapore'],
  ['si', 'Slovenia'], ['sk', 'Slovakia'], ['sl', 'Sierra Leone'], ['sm', 'San Marino'], ['sn', 'Senegal'],
  ['so', 'Somalia'], ['sr', 'Suriname'], ['ss', 'South Sudan'], ['st', 'São Tomé and Príncipe'],
  ['sv', 'El Salvador'], ['sy', 'Syria'], ['sz', 'Eswatini'], ['tc', 'Turks and Caicos Islands'],
  ['td', 'Chad'], ['tg', 'Togo'], ['th', 'Thailand'], ['tj', 'Tajikistan'], ['tk', 'Tokelau'],
  ['tl', 'Timor-Leste'], ['tm', 'Turkmenistan'], ['tn', 'Tunisia'], ['to', 'Tonga'], ['tr', 'Turkey'],
  ['tt', 'Trinidad and Tobago'], ['tv', 'Tuvalu'], ['tw', 'Taiwan'], ['tz', 'Tanzania'], ['ua', 'Ukraine'],
  ['ug', 'Uganda'], ['us', 'United States'], ['uy', 'Uruguay'], ['uz', 'Uzbekistan'],
  ['vc', 'Saint Vincent and the Grenadines'], ['ve', 'Venezuela'], ['vg', 'British Virgin Islands'],
  ['vi', 'U.S. Virgin Islands'], ['vn', 'Vietnam'], ['vu', 'Vanuatu'], ['ws', 'Samoa'], ['ye', 'Yemen'],
  ['za', 'South Africa'], ['zm', 'Zambia'], ['zw', 'Zimbabwe'],
]

const FLAGS = COUNTRIES.map(([code, name]) => ({
  id: `flag_${code}`,
  shortcuts: [`(flag:${code})`],
  emoji: flagEmoji(code),
  label: `${name} flag`,
}))

/** The full set: classic (hand-drawn) + extra (glyph fallback) + flags. */
export const EMOTICONS = [...CLASSIC, ...EXTRA, ...FLAGS]

/** Faces, gestures and objects only — everything except flags. Used by the
 *  picker's default tab so 190-odd flags don't drown out the rest. */
export const EXPRESSIVE_EMOTICONS = [...CLASSIC, ...EXTRA]

/** Flags only, for the picker's dedicated "Flags" tab. */
export const FLAG_EMOTICONS = FLAGS

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
