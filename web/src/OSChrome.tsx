import type { ReactNode } from 'react'
import type { ThemeId } from './themes'
import './oschrome.css'

/** Which desktop OS each Skype era actually shipped against.
 *  Drives both the window frame and the wallpaper behind it. */
const OS_FOR_ERA: Record<ThemeId, string> = {
  skype3: 'xp',      // Skype 3 (2007) — Windows XP, Luna Blue
  skype4: 'vista',   // Skype 4 (2009) — Windows Vista, Aero glass
  skype5: 'win7',    // Skype 5 (2010) — Windows 7, refined Aero
  skype6: 'win8',    // Skype 6 (2012) — Windows 8, flat Metro
  skype7: 'win10',   // Skype 7 (2014) — Windows 8.1/10, flat chrome
  skype8: 'win11',   // Skype 8+ (2018→) — Windows 10/11, rounded Mica
  light:  'win11',
  dark:   'win11',
}

/** Title text in the frame's caption bar, matching what the real client showed. */
const CAPTION_FOR_ERA: Record<ThemeId, string> = {
  skype3: 'Skype™ — jakes1345',
  skype4: 'Skype™ — jakes1345',
  skype5: 'Skype™ — jakes1345',
  skype6: 'Skype',
  skype7: 'Skype™ — jakes1345',
  skype8: 'Phaze',
  light:  'Phaze',
  dark:   'Phaze',
}

interface Props {
  theme: ThemeId
  children: ReactNode
  /** Turns the frame off entirely — app renders edge-to-edge as normal. */
  enabled: boolean
}

/**
 * Wraps the app in a period-accurate desktop window frame.
 *
 * Purely cosmetic: no real window management, no VM, no emulation. It's a
 * styled div with a caption bar, sitting on a CSS wallpaper. The point is
 * that Skype 3 in a bare browser tab doesn't feel like 2007 — Skype 3 inside
 * an XP Luna window on a Bliss-green desktop does.
 *
 * The min/max/close buttons are deliberately inert. Wiring them to anything
 * would be a lie: there's no OS here to minimise to.
 */
export default function OSChrome({ theme, children, enabled }: Props) {
  if (!enabled) return <>{children}</>

  const os = OS_FOR_ERA[theme]
  const caption = CAPTION_FOR_ERA[theme]

  return (
    <div className={`os-desktop os-${os}`}>
      <div className="os-window">
        <div className="os-titlebar">
          <span className="os-title-icon" aria-hidden="true">S</span>
          <span className="os-title-text">{caption}</span>
          <div className="os-title-buttons">
            <button type="button" className="os-btn os-btn-min" tabIndex={-1} aria-hidden="true">
              <span className="os-glyph-min" />
            </button>
            <button type="button" className="os-btn os-btn-max" tabIndex={-1} aria-hidden="true">
              <span className="os-glyph-max" />
            </button>
            <button type="button" className="os-btn os-btn-close" tabIndex={-1} aria-hidden="true">
              <span className="os-glyph-close" />
            </button>
          </div>
        </div>
        <div className="os-window-body">{children}</div>
      </div>
    </div>
  )
}
