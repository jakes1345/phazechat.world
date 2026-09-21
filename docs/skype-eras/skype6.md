# Skype 6.x (2012-2014)

## At a glance

- Skype 6.0 for Windows and Mac shipped October 24, 2012, alongside a separate Windows 8 "Metro"-style app for the Windows Store [6]. The Windows 8 app used a full-screen Metro/Modern redesign with a live tile for missed calls/messages and a Snap mode for multitasking (partly sourced — the specific October 26, 2012 Store-availability date is not independently confirmed) [1].
- Skype 6.0 added sign-in with a Facebook or Microsoft account, so users with a Live Messenger, Hotmail, or Outlook.com account already had a compatible account [6].
- Group video calling remained a paid Skype Premium feature through most of the 6.x era and only became free for all users on April 28, 2014, rolling out to Windows, Mac, and Xbox One for up to 10 people [3].
- In September 2014, Skype's minimum platform requirements rose to Windows Vista (dropping XP) and Mac OS X 10.5 Leopard with an Intel Core 2 Duo (dropping Tiger) [4].

## Changelog and platform

- Skype 6.0.0.120 for Windows was released October 24, 2012, with a Windows 8 "Metro" companion version [6]. **Confirmed directly this pass** (source [2], ghacks.net, was 403 on every earlier attempt): the desktop version for Windows and Mac was released the same day, explicitly distinct from the separate Windows 8 Metro app releasing days later — "you should not confuse the version with the Skype app for Windows 8." Skype 6.0 also removed the online-contact-count display from the interface "in an effort to unclutter the interface," and the updater installed a "Skype Click to Call" browser extension automatically during the update [2].
- The Windows 8 Metro/Modern app featured a full-screen redesign fitting the Metro/Modern design language, a live tile on the Start screen for missed calls and messages, and a Snap mode to resize video chat for multitasking; it was distributed through the Windows Store (partly sourced — the article confirms these features but states only that it was published "days ahead of official release," not the specific October 26, 2012 date) [1].
- Group video calling had been "a premium service for paying customers since it exited beta" (dating to roughly early 2011) [3].
- On April 28, 2014, group video calling became free for all users, rolling out to Windows, Mac, and Xbox One, supporting up to 10 people [3].
- As of September 16, 2014, the minimum Windows requirement was Windows Vista, "cutting out XP" [4].
- The same 2014 change set the Mac minimum to Mac OS X 10.5 Leopard with an Intel Core 2 Duo, meaning "no support for Mac OS X 10.4 Tiger" [4].

## Settings and UI

- Skype 6.0's interface was refreshed and "flattened" for a less cluttered look, described as a "Don't-call-it-Metro-friendly UI" on Windows [6].
- Skype 6.0 let users sign in directly with a Facebook or Microsoft account instead of only a Skype account; a Live Messenger, Hotmail, or Outlook.com account already qualified as a compatible Microsoft account [6]. **Confirmed directly this pass** via source [2]: signing in with a Microsoft account (only) additionally enabled Instant Messaging with Windows Live Messenger, Hotmail, or Outlook.com contacts from directly within Skype, and Skype 6 added support for 6 new interface languages (Thai, Croatian, Slovenian, Serbian, Catalan, Slovak) plus the return of previously-created profile pictures [2].
- In the Windows 8 Modern app, profile details, settings, and options were reached by swiping in from the right (or hovering the mouse in the bottom-right corner) to open the Charms bar and selecting Settings, rather than a Tools > Options menu as in the desktop app [8].
- The Modern app's home screen showed active instant-message conversations — those with contacts who are online — across the top, which the user could tap to resume [8].
- Opening a conversation in the Modern app made the chat window take up the whole available screen area, requiring a tap on the back arrow to return to the main screen; file sharing was done via a plus button with a "send files" option [8].
- The Modern app's call window showed the user's profile plus buttons for opening camera, voice, instant messaging, and file-sending modes; the dial pad lacked a backspace key, requiring the user to click into the dialed-number field and use the keyboard to delete digits [8].
- The Modern app notably lacked call recording and other tools that had long been available in the desktop app [8].

## Presence and messaging

- Skype's standard visible emoticon palette totaled 72 emoticons in the program during the 5.5-6.14 era [9].
- Skype 6.14 added new hidden/concealed emoticons: (talktothehand), (dog), (shielddeflect), (idea), (sheep), (blackwidow), (bike), (nickfury), (bucky), (cat), (captain) [9]. **Confirmed directly this pass** via source [21] (en.chat4o.com/skype-6-14/ — was unreachable before): this exact 11-emoticon list, added in the build released **February 19, 2014**. Of these, (blackwidow), (nickfury), (bucky), (captain), and (shielddeflect) are the Marvel-themed additions specifically; the other six ((talktothehand), (dog), (idea), (sheep), (bike), (cat)) are not Marvel-related.
- Some hidden emoticons present in earlier versions — (finger), (fubar), (wtf) — were removed before version 6.14 [9]. **Confirmed directly this pass**: source [21] gives the same three plus a fourth, (hollest), all removed in the 6.14 build itself (not "pulled by 6.20" as an earlier pass's framing implied — that specific 6.20 detail is not in this source and remains unconfirmed) [21].
- Two hidden emoticons, (oliver) and (soccer), debuted in Skype 5.9 and remained as legacy hidden codes into the 6.x era [9].
- Country flags are supported as emoticons via the code format (flag:XX), where XX is a 2-letter country code, e.g. (flag:US) [9].
- Skype group chats used a P2P-based role system with four roles: Creator (the member who created the chat; only one Creator per chat), Master (also called a chat host; Masters cannot promote other members to Master), User (a member who can post messages), and Applicant (a member waiting for acceptance into the chat) (partly sourced — the source describing this system is undated, so its currency specifically for the 2012-2014 window is not separately confirmed) [10].
- Group chat slash-commands included /add [skypeName] (add a contact to the chat), /kick [skypeName] (eject a chat member), /setrole [skypeName] (set a member's role), /leave (leave the current group chat), /showmembers (list members and roles), /topic [text] (change the chat topic), /alertsoff (disable message notifications), and /me [text] (prefix a chat line with the sender's name in an action format) (partly sourced — same undated-source caveat as above) [10].
- Skype presence statuses and their behavior: Online means the user is signed in and ready to receive calls, messages, or files; Away means the user is signed in but away, and the client can auto-switch a user to Away after 5 minutes of inactivity; Do Not Disturb blocks pop-up notification windows for incoming calls, files, and messages while other activity continues; Invisible lets a user see and interact with everybody normally while appearing Offline to others; Offline means the user is not signed in (having quit Skype or turned off their computer) and cannot receive communications; SkypeMe! makes a user ready to receive calls from everybody, and is "not available in all versions" [11].

## Calling and notifications

- In August 2014, Microsoft rolled out smarter "active endpoints" chat notifications that were sent only to the device the user was actively using at the time, while other signed-in devices (PCs, tablets, smartphones) stayed silent [15].
- This active-endpoints rollout required users to run the most current version of Skype on their respective devices and rolled out gradually "over the next few weeks" starting August 20, 2014 [15].
- As of a March 2013 PCWorld review, Skype itself created no native call recording; third-party tools such as Free Video Call Recorder for Skype were used instead, producing MP4 files for video calls and MP3 files for audio calls [16].
- Per Wikipedia's overview, Skype at some point supported free conference calls, video chats, and screen sharing for up to 25 people, later expanded to 50 people by around April 2019 (partly sourced — tertiary source, and the 25-person figure is not dated to the 6.x window specifically) [17].

## Refuted or unresolved — from the skeptic sample

- Skype for Windows 8 Metro app being available in the Windows Store on the specific date October 26, 2012: a second source (Engadget) confirms the general late-October 2012 timeframe and a "Windows 8 Metro companion version" but does not itself state October 26 — unresolved [1][6].
- "Skype giving away free group calls for a year" (December 2013, framed as a 12-month giveaway of $9.99/month Premium features): checking the actual TechRadar article content shows the real offer was a short promotional giveaway ("for free this week") tied to a "Skype Collaboration Project," priced normally at £2.99/month ($4.90), not a 12-month giveaway of a $9.99/month tier. This claim is not supported [13].
- "Group video calling originally launched as a premium service in January 2011 at $4.99/day or $8.99/month": the cited TechRadar article contains no such content. Not supported [13].
- "Skype for Windows 8 supports free group calls and screen sharing for up to 10 people" and "Messenger users could sign in with Messenger credentials for screen sharing, mobile video, Facebook video calling and group video calling": the cited skaip.org page is a version-download listing with no such content. Not supported [14].
- Hexus.net claims about Modern-app swipe-down app-bar gestures (add contact/save number) and about desktop-sharing directionality (PC-to-Modern only): neither claimed quote is present in the actual Hexus article. Not supported [7].
- Group video calling becoming free on April 28, 2014 for up to 10 people on Windows/Mac/Xbox One: corroborated only by the original TechCrunch reporting; a second outlet (Forbes) could not be fetched (403), and the Skype blog original was not independently retrieved this pass. Unresolved beyond the single TechCrunch source [3][12][19].
- Group video calling having been paid/premium from beta-exit (~2011) until April 2014: Wikipedia's general history of Skype's group-calling tier changes is consistent with this but does not itself give the 2011 date. Unresolved as independent confirmation [3][17].
- The 25-to-50-person free group-call cap expansion "by April 2019": no second source retrieved this pass beyond Wikipedia. Unresolved [17].
- The "72 standard emoticons" figure: Skype's own support page (the natural primary corroboration) could not be fetched this pass. Unresolved beyond chat4o.com [9][20].
- "Skype 6.14 released 19 February 2014 with Marvel-themed hidden emoticons": now confirmed directly (source [21] fetched successfully this pass — see Presence and messaging above). Still sourced only to the same chat4o.com domain family as source [9], so cross-outlet independence remains unconfirmed; the further claim that these were "later pulled by 6.20" is not supported by this source at all (it only covers the 6.14 release) and stays unresolved.

## Differences from the earlier research docs — from the critique's contradictions list

- The prior theme table (`const SKYPE6 = SKYPE5`) treats group video calling as an unconditional, always-free capability inherited from Skype 5 onward, with no payment gating recorded anywhere. New evidence shows group video calling was "a premium service for paying customers since it exited beta" (~early 2011) and was made free for everyone only on April 28, 2014 — meaning for nearly the entire Skype 6.x era (October 2012 to early 2014) it was a paid feature, not the free capability the prior table implies [3].
- The prior research doc's 6.x section lists only account-plumbing and interface items (no-account-required sign-in, Messenger merge, interface languages, retina/multi-window chat, Metro design, 6.1 Outlook integration, 6.5 notification/Contact-Requests change, 6.14 emoticons, video messaging) and does not mention the Windows 8 Modern/Metro app's distinct settings model, UI structure, or its lack of call recording relative to the desktop app. New evidence adds: Charms-bar settings access (not Tools > Options), a home screen with an active-conversation strip, full-screen conversation view with a back arrow, plus-button file sharing, a dial pad without a backspace key, and an explicit lack of call recording and other desktop-only tools [8].
- The prior gaps doc lists dateable presence/notification changes (SkypeMe removal at Skype 5, per-contact notifications at Skype 7) but never enumerates the specific status values with behavioral definitions. New evidence supplies concrete definitions for Online, Away (with the 5-minute auto-switch timeout), Do Not Disturb, Invisible, Offline, and SkypeMe — a level of detail absent from the prior docs [11].
- The prior research doc's emoticons appendix (roughly 600 emoticons total, ~237 flag emoticons, ~72 standard emoticons formalized in Skype 5.5) matches the new evidence's "72" figure and the 6.14 hidden-emoticon batch closely, but does not enumerate the specific hidden codes ((finger), (fubar), (wtf)) removed before 6.14, which the new evidence does specify [9].

## Remaining gaps — from the critique's gaps list

- No documentation of the Windows 6.x desktop-client Tools > Options menu structure (sound/notification settings, privacy tab layout) — only the separate Metro app's Charms-bar settings are covered above.
- No sound/ringtone specifics for 6.x (default ring, IM alert sound, whether customizable).
- No detail on Skype 6.x file-transfer size limits or supported file types.
- No specifics on the Metro app's contact list, add-contact flow, or search UI beyond the home-screen conversation strip.
- No confirmation of exact group video-call participant/simultaneous-call limits specific to the paid-tier era of 6.x (only the later 2014 free-tier "10 people" figure is sourced).
- No coverage of the Windows desktop (non-Metro) 6.x call window layout or buttons — only the Metro app's call window is described above.

## Unverified / open questions — every source_unreachable claim and every UNSOURCED open question, clearly labelled as not confirmed this pass

The following were not confirmed this pass, either because the source could not be reached (marked "source unreachable") or because they came from an unverified summary rather than a fetched page (marked "UNSOURCED"):

- **Resolved this pass** (were "source unreachable" [2]; ghacks.net fetched successfully): the desktop version of Skype for Windows and Mac was released in October 2012, distinct from the Windows 8 Metro app — confirmed. After merging a Microsoft account with a Skype account, users gained Messenger/Hotmail/Outlook.com IM interop — confirmed (see Changelog/Settings above). "Tools > Options > Advanced... 'Help improve Skype' telemetry checkbox" — not found in the fetched article text; still unconfirmed, but the source itself is no longer unreachable, so this may simply be a claim the article doesn't cover rather than one it refutes.
- Source unreachable: the last Skype version usable on Windows XP was 7.36.0.150 [5] (oldapps.com, HTTP 522 — checked again this pass, still down).
- Source unreachable: group video calling for up to 10 people was made free on Mac, Windows, and Xbox One (Forbes duplicate of the TechCrunch claim) [12] (forbes.com, 403 — checked again this pass with a stealth-browser fetch too, still blocked).
- Source unreachable: Skype's own emoticons FAQ page, which would corroborate the "72 emoticons" figure [20] (support.skype.com — checked again this pass; the domain now redirects to a dead internal address and could not be fetched at all).
- **Resolved this pass** (was "source unreachable" [21]; en.chat4o.com/skype-6-14/ fetched successfully): chat4o.com's page on Skype 6.14's release date and emoticon changes — confirmed, see Presence and messaging above.
- Source unreachable: Wikipedia's cited 2019 Skype blog post on the 50-person group-call cap [22] (blogs.skype.com — not re-checked this pass).
- UNSOURCED: Skype 6.0 (Oct 2012) allowed sign-in without a Skype account using Microsoft or Facebook credentials, and added IM interop with Windows Live Messenger/Hotmail/Outlook.com contacts, plus localization to Thai, Croatian, Slovenian, Serbian, Catalan, Slovak — from an unverified summary, not confirmed against a fetched page this pass.
- UNSOURCED: dated changelogs for Skype 6.1, 6.2, 6.3, 6.5, 6.6, 6.7, 6.9, 6.10, 6.11, 6.13, 6.14, 6.16, 6.18, 6.20, 6.21, 6.22.
- UNSOURCED: Skype Premium and Skype Credit tier pricing and unlocked features for the 6.x era.
- UNSOURCED: Skype Extras/API status during the 6.x era.
- UNSOURCED: full Tools > Options category list (General, Privacy, Notifications, IM & SMS, Calls, Sounds, Advanced, Connection, Hotkeys) as distinct named tabs for this era.
- UNSOURCED: exact desktop menu bar contents (File, View, Contacts, Conversations, Call, Tools, Help) for Skype 6.x.
- UNSOURCED: main window layout details (contacts panel, chat docking, profile editor placement, tray icon behavior) for the desktop 6.x client.
- UNSOURCED: whether default settings values changed across 6.0-6.22 point releases.
- UNSOURCED: specific UI changes in later 6.x point releases (6.5, 6.7, 6.14, 6.18, 6.21, etc.).
- UNSOURCED: message editing/deletion within a limited time window and local chat history retention settings for 6.x.
- UNSOURCED: typing indicator ("X is writing...") presence in 6.x/Metro UI specifically.
- UNSOURCED: whether read receipts, Mojis/reactions, and @mentions were absent in the 6.x era (a 2018 date for read receipts implies absence in 6.x, but no source positively describes 6.x's absence of these features).
- UNSOURCED: file transfer size limits for Skype 6.x.
- UNSOURCED: specific privacy controls (contact request approval, blocking a contact, "allow calls from anyone in my contact list only") in the 6.x Options dialog.
- UNSOURCED: profile fields (Skype Name, mood message, full name, birthday, gender, homepage, phone numbers) in the 6.x profile editor.
- UNSOURCED: whether the P2P group-chat role/command system (Creator/Master/User/Applicant, /setrole, /kick) documented above applies specifically to 2012-2014 rather than an earlier or later era, since P2P group chat was eventually replaced by cloud-based group chat in later Skype versions.
- UNSOURCED: video call codec/resolution specifics (e.g., H.264, VP8, SILK) for 6.x.
- UNSOURCED: in-call control UI (mute, hold, add call, transfer) for 6.x.
- UNSOURCED: SkypeOut/SkypeIn/Skype Number/Skype Credit pricing and mechanics for the 6.x era.
- UNSOURCED: full notification sound event list and configurability for 6.x.
- UNSOURCED: exact group video call participant cap at Skype 6.0 launch (Oct 2012), prior to the 2014 10-person free tier; some sources reference an earlier 5-person Premium cap.
- UNSOURCED: whether call recording was natively built into any Skype 6.x point release, as opposed to being entirely third-party.
- UNSOURCED: screen-sharing UI details ("Share Screen" button location, full-screen mode) specific to the 6.x Metro/desktop client.

## Sources

1. https://techcrunch.com/2012/10/22/microsoft-debuts-skype-for-windows-8-offers-modern-design-live-tiles-focus-on-tight-windows-8-integration/ — secondary
2. https://www.ghacks.net/2012/10/24/skype-6-released/ — secondary; fetched successfully this pass (was 403 before)
3. https://techcrunch.com/?p=993879 — secondary
4. https://lowendmac.com/2014/skype-no-longer-supporting-older-systems/ — secondary
5. https://www.oldapps.com/skype.php?system=windows_xp — tertiary (unreachable, HTTP 522)
6. https://www.engadget.com/2012/10/24/skype-6-0-for-mac-and-windows/ — secondary
7. https://hexus.net/tech/news/software/43929-skype-receive-shiny-new-ui-windows-8-modern-ui/ — secondary (claims not found in source; not_supported)
8. https://www.makeuseof.com/tag/skype-reviewed-for-windows-8-modern/ — secondary
9. https://en.chat4o.com/skype-emoticons/ — secondary
10. https://github.com/vrachieru/cheatsheet/blob/master/database/chat/skype.cheatsheet — secondary
11. https://en.chat4o.com/skype-statuses/ — secondary
12. https://www.forbes.com/sites/amitchowdhry/2014/04/29/skypes-group-video-calling-service-is-now-free/ — secondary (unreachable, 403)
13. https://www.techradar.com/news/phone-and-communications/voip/skype-giving-away-free-group-calls-for-a-year-1209058 — secondary (claims not_supported by actual article content)
14. http://www.skaip.org/skype-versions — secondary (claims not found in source; not_supported)
15. https://techcrunch.com/2014/08/20/skype-will-make-itself-less-noisy-thanks-to-new-smarter-chat-notifications/ — secondary
16. https://www.pcworld.com/article/457241/review-free-video-call-recorder-for-skype-records-unlimited-video-and-audio-for-free.html — secondary
17. https://en.wikipedia.org/wiki/Skype — tertiary
18. https://www.theverge.com/2014/9/15/6153323/skype-drops-support-for-windows-xp-and-mac-os-x-tiger — secondary (skeptic cross-check source)
19. https://blogs.skype.com/news/2014/04/28/say-hello-to-free-group-video-calling/ — primary (not independently fetched this pass)
20. https://support.skype.com/en/faq/FA34681/what-emoticons-are-available-in-skype — primary (unreachable)
21. https://en.chat4o.com/skype-6-14/ — secondary; fetched successfully this pass (was unreachable before) — same domain as source 9, not independent
22. https://blogs.skype.com/news/2019/04/ — primary (unreachable)
