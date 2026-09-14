# Measured reference values for the era themes

Everything in `web/src/App.css` under `.app.theme-skype3` … `.theme-skype8`
was originally written from memory. This file records the values that have
since been **measured off real screenshots**, so the next person to touch a
palette can tell a sampled value from a guessed one.

The rule this file exists to enforce: *if a colour or a height is not listed
here, nobody has checked it.* Say so rather than calling the theme accurate.

## Method

Screenshots were pulled down with `curl` (Chromium in this sandbox can't
reach external hosts through the proxy) and sampled with a small pure-Python
PNG decoder — there's no PIL here. Each value below is the **modal colour
over a region**, not a single pixel, so JPEG ringing and antialiasing don't
skew it.

Where a source is a downscaled or colour-quantised copy, that's noted. Those
give reliable *hue and structure* but not exact bytes, and the CSS comments
say as much.

## Sources

| Era | Source | Native size | Quality |
| --- | --- | --- | --- |
| Skype 1.0 | en.wikipedia `Skype10.gif`, via Wayback (2007 capture) | 200×314 | thumbnail, structure only |
| Skype 3.x | en.wikipedia `Skype_windows.png`, via Wayback (2007 capture) | 224×275 | **native resolution, lossless** — best reference held |
| Skype 4.0 | en.wikipedia `Skype 4.0 screenshot.png` (from a 2009 NYT review) | 388×247 | downscaled + lossy; hue and layout only |
| Skype 5.x | en.wikipedia `Skype_Default.png` / `Skype.png` thumbs, via Wayback | ≤250×142 | too small to sample |
| Skype 6.x | en.wikipedia `Skype.png`, Wayback capture `20140718011340` | 400×255 | downscaled; shows Skype Home, not a conversation |
| Skype 7.x | en.wikipedia `Skype.png`, Wayback capture `20150212024251` | 579×318 | downscaled but readable |
| Skype 8 (dark) | en.wikipedia `Skype.png` (14.32.55.11), via Wayback (2018 capture) | 1107×869 | **native resolution, lossless** |

Wikimedia Commons holds no old Skype UI screenshots — they're non-free, so
they live on the local en.wikipedia wiki instead, and old revisions of those
files are suppressed. The Wayback Machine captures of the article are the
way in. BetaWiki, which would be the obvious source, is behind a Cloudflare
challenge this sandbox can't pass.

## Skype 3 (2006–2008, Windows XP)

Sampled from the 224×275 native screenshot. Note the source was saved with a
reduced palette, so channel values land on multiples of ~8 — treat these as
accurate to about ±4 per channel.

| Element | Value |
| --- | --- |
| Luna caption, top rim | `#3986FF` |
| Luna caption, dark band (~26% down) | `#1838D6` |
| Luna caption, body | `#1838DE` |
| Luna caption, lower brightening | `#184DFF` |
| Caption height | 25px |
| Menu bar | `#E7E7CE`, **flat, no gradient** |
| Menu bar height | 20px |
| Panel background | `#FFFFFF` |
| **Contact row, selected** | `#A5CBFF` with **black** text |
| Contact row height | ~22px, 16px status icon (no photo) |

The correction worth calling out: the selected row is *not* the Explorer
`#316AC5`-with-white-text that everyone reaches for. Skype drew its own
lighter highlight and kept the text black.

## Skype 4 (2009, Vista)

From the 388×247 lossy copy — hues are trustworthy, exact bytes are not.

| Element | Value |
| --- | --- |
| List group header ("Today") | `#00A6FB`, white bold text, full-width bar |
| Right-hand profile pane | `#DAE1E9` |
| Panel background | `#FFFFFF` |
| Contact row | compact, roughly twice the text height |

Structural notes taken from the same image, which the CSS now follows:

* The contact list was still **compact** — name and mood on one line, an
  icon-sized avatar. The big photo-led list is Skype 5's change, not this
  release's.
* Tabs were **text** ("Contacts" / "Conversations"), not icons.
* There was a **right-hand profile pane** listing fields (gender, Skype
  name, location, birthday, language).
* Call and Video call were **two separate green pill buttons** side by side,
  not one call button in the header.

The last two are still not implemented. See "Known gaps".

### Getting a *specific* capture out of the Wayback Machine

Worth writing down, because it's what unblocked Skype 6 and 7 after
several dead ends. The Wikipedia infobox screenshot has always lived at
one URL — `upload.wikimedia.org/wikipedia/en/3/31/Skype.png` — and was
replaced in place as each new Skype shipped. Asking Wayback for a rough
date silently returns the *nearest* capture, which is how a request for
February 2015 kept handing back the 2018 image.

The fix is to list the captures first and then ask for one by its exact
timestamp:

```
curl 'https://web.archive.org/cdx/search/cdx?url=upload.wikimedia.org/wikipedia/en/3/31/Skype.png&output=text&fl=timestamp,statuscode,digest'
curl -L 'https://web.archive.org/web/<exact-timestamp>im_/http://upload.wikimedia.org/wikipedia/en/3/31/Skype.png'
```

The `digest` column is the useful part: distinct digests mark the points
where the image actually changed, so each one is a different era. Two
distinct digests covered Skype 6 and Skype 7.

Routes that did *not* work, so nobody repeats them: the Internet
Archive's `skypeversions` item is a complete set of installers from 0.9x
to 7.41 but contains no screenshots at all; oldversion.com and
softpedia's archived pages carry only icons; the `skypeassets.com`
`features-*.jpg` files on the 2011 skype.com download page are feature
icons, not UI.

## Skype 7 (2014–2017)

Sampled from the 579×318 capture. Downscaled, so treat these as accurate
hues rather than exact bytes.

| Element | Value |
| --- | --- |
| Left rail background | `#F3FCFE` |
| Chat pane background | `#FFFFFF` |
| Menu bar | `#F7F7F7`, flat |
| Windows 8 title bar | `#8FC3E9` |
| **Message bubble, both directions** | `#DEF7FD` |
| Selected contact row / hovered message | `#B7EEFD` |

Three things this corrected, all of which had been written from memory:

1. **The left rail is very nearly white** (`#F3FCFE`). It had been
   `#D4E2F2`, a mid blue-grey, which made the whole window read heavier
   and more "Windows 7" than Skype 7 ever looked.
2. **Outgoing bubbles are not solid brand blue.** Both directions are
   the same pale `#DEF7FD` with dark text, separated by alignment — the
   same mistake, and the same correction, as Skype 8. The saturated
   `#00AFF0` is for buttons and accents only.
3. **Skype 7 had bubbles at all.** The CSS had it as a flat full-width
   text log shared with Skype 3–6, and a comment in `App.css` asserted
   that "no Skype before 8" right-aligned outgoing messages. The
   reference shows rounded bubbles sized to their text, incoming left
   and outgoing right. Skype 7 belongs with Skype 8 for message
   rendering, while keeping the classic menu bar and compact contact
   list — those are separate concerns and are now scoped separately.

## Skype 8 (2018, dark)

Sampled from the 1107×869 native screenshot. These are exact.

| Element | Value |
| --- | --- |
| Title bar | `#000000`, 32px tall |
| Message area background | `#19191B` |
| Sidebar background | `#202023` |
| Search field background | `#19191B` |
| Message bubble — **incoming and outgoing alike** | `#2B2C33` |
| Compose box | `#2B2C33` |
| Selected sidebar row | `#2B2C33` |
| Divider rule | `#444446` |
| Active nav accent | `#1686D9` |
| Sidebar width | 347px |
| Contact row pitch | ~62px, 32px avatar |
| Search field height | 31px |
| Message column | x=435..1020 of a 759px pane — ~77%, even gutters |
| Date separator rule | `#444446` hairline either side of a centred label |
| Search / compose corner radius | 4px (not a pill) |
| Section labels | small grey **capitals** with slight tracking |

Layout notes from the same image:

* A one-to-one conversation shows **no avatar and no sender name** beside
  a bubble. Two people, so alignment carries it. (Group chats keep the
  coloured sender name — different markup, so they're unaffected.)
* **Nothing in the compose row is accent-filled.** The emoji glyph at the
  left of the box and the two icons at its right are all the same grey as
  the box. There is no blue send disc.

Three things measuring corrected, the first two guessed the other way
round and the third not a guess at all but an accident:

1. **The sidebar is lighter than the message area**, not darker. Every
   modern chat app does the opposite, which is exactly why the wrong one
   felt right.
2. **Outgoing bubbles are not blue.** Skype 8's dark theme used the same
   `#2B2C33` for both directions and separated them by alignment alone. The
   blue outgoing bubble belongs to the light theme and to later builds.
3. **Skype 8 was being painted purple.** Thirteen rule blocks in `App.css`
   were written as `:is(.theme-dark, .theme-skype8)` — the era had been
   folded into the Phaze dark theme on the assumption that "dark is dark".
   It was inheriting an animated purple mesh gradient on the sign-in page,
   a `rgba(15,5,35)` sidebar, purple-bordered inputs and a purple row
   highlight, none of which Skype ever had. Those blocks are now
   `.theme-dark` only.

That third one is the reason this file exists. Sharing a rule between two
themes is how an era stops being a recreation and starts being a re-skin,
and it happens quietly — the CSS looked tidy, and the screenshot was the
only thing that gave it away.

## Known gaps

Listing these rather than letting them pass as finished work:

* **Skype 5 has no usable reference.** Its palette and metrics are still
  written entirely from memory. It is now the only era in that state.
* **Skype 6's reference shows the "Skype Home" pane, not a conversation**,
  so its chat colours and bubble treatment are unverified — in particular,
  whether Skype 6 had bubbles like Skype 7 or a flat log like 3–5. It is
  currently grouped with the flat-log eras on the strength of nothing
  better than a guess.
* Skype 7's reference is a downscaled 579×318, so its values are good
  hues but not exact bytes. A native-resolution shot would let the
  palette be pinned properly.
* Skype 4's right-hand profile pane and its twin green call buttons are
  described above but not built.
* Skype 8 has no title bar, and its composer icons sit outside the
  compose box rather than inside it. (The nav tab strip and the sidebar
  profile row are built — both already existed in the markup but were
  gated to other eras, so the sidebar had been starting at the search
  box. The tab set is the app's own views, labelled, rather than Skype's
  literal Chats / Calls / Contacts / Notifications, since inventing nav
  that goes nowhere would be worse than a faithful-looking strip.)
* The in-chat date separator is measured for Skype 8 only. Skype 3-6 now
  get a plain centred date line, which is period-plausible and legible,
  but it is not taken from a reference. (It previously had no rule at all
  outside Skype 7, so it rendered as unstyled text — invisible on Skype
  8's dark background.)
* Skype 4's two-column message layout (name in the left gutter, text beside
  it, timestamp right-aligned) is not implemented; the app stacks name over
  text in every era.
* The measurements above were taken at 1280×820. Phone width (400×780)
  has now been checked in all six: none scrolls sideways, and the classic
  menu bar tightens below 560px so all seven menus still fit — before
  that, "Help" ran to x=418 on a 400px viewport and was simply cut off,
  which matters because those menus are the only route to the era picker.
  What has *not* been checked is whether each era's proportions are still
  period-accurate at that size: real Skype had no phone layout to copy,
  so the narrow view is our invention in every era.
* Skype 8's light theme is unmeasured — only the dark one has a reference.
