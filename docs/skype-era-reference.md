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
| Skype 6.x | — | — | **none found** |
| Skype 7.x | — | — | **none found** |
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

* **Skype 5, 6 and 7 have no usable reference at all.** Their palettes and
  metrics are still written from memory. Skype 7 is the theme the whole app
  was originally built around, so it's also the one where being wrong is
  least visible — and least verified.
* Skype 4's right-hand profile pane and its twin green call buttons are
  described above but not built.
* Skype 4's two-column message layout (name in the left gutter, text beside
  it, timestamp right-aligned) is not implemented; the app stacks name over
  text in every era.
* Every measurement above was taken at 1280×820. **Phone width (~400px) has
  never been checked in any era.**
* Skype 8's light theme is unmeasured — only the dark one has a reference.
