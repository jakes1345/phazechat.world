# Skype 3.x (2006-2008)

## At a glance

- Skype 3.0 for Windows was unveiled/released December 13, 2006, at which point Skype had over 136 million users [1][11].
- The release introduced three headline social features: Extras, Public Chats, and Mood Messages [1][2].
- Skype 3.0 changed the client's network behavior (packet length and how encrypted UDP channels are opened between clients), which broke prior Skype-detection network filters [6].
- Point releases through 3.8 (2007-2008) added calling features (auto redial, call transfer, high-quality video), chat editing, and enterprise policy management via Group Policy/registry, per the Skype Network Administrator's Guide first published for Skype for Windows 3.0 in December 2006 [4].

## Changelog and platform

- Skype 3.0 for Windows was released/unveiled on December 13, 2006 [1]; independently confirmed by Telecompaper's coverage of the Skype 3.0 for Windows launch [11].
- At the time of the Skype 3.0 release, Skype had over 136 million users [1]. (This specific figure could not be independently corroborated; see Unverified section.)
- A build changelog for 3.0.0.217 (relative to 3.0.0.216) lists new features: Skype Find, an Account Panel redesign, an Alerts Platform, a typing indicator, and API enhancements for avatars and contact management [3].
- A build changelog for 3.0.0.214 (relative to 3.0.0.209) lists bug fixes: a SkypePM.exe crash on first startup, Russian-language display issues in the updater, and corrected Groups panel behavior during user changes [3].
- A build changelog for 3.0.0.198 (relative to 3.0.0.190) lists fixes for an e-mail validation pattern that did not allow numbers before the @ sign, an SMS number verification crash, video call ending issues, and call forwarding API functionality [3].
- Skype 3.1 (build 3.1.0.147, relative to 3.1.0.112) introduced "Send Money", a custom audio codec implementation, an improved conference mixer, and "Import Contacts from MSN Hotmail, Yahoo! and GMail", and made Voice Mail playback pause Winamp [3].
- Skype 3.2 (build 3.2.0.163, relative to 3.2.0.158) introduced Auto redial, Call Transfer, Device Indicators, and the ability to "Edit chat messages" [3]. A claim that this same build also added contact-sending within chat is not confirmed — it could not be found in the sourced changelog (partly sourced, contact-sending item not_supported).
- Skype 3.5 (build 3.5.0.239) added High Quality Video calls [3]. Claims that this same build added "screen sharing enhancements" and "API improvements for window status notifications" are not supported by the source, which places screen sharing only in v4.0+ releases — see Refuted section.
- Skype 3.8 (build 3.8.0.180, relative to 3.8.0.139) added mjpg webcam support, Logitech Vision Pro high-quality video support, and updated the Firefox plugin to version 2.2.0.102 [3].
- The Skype Network Administrator's Guide was first published for Skype for Windows 3.0 (December 2006), documenting Group Policy and registry-based policy configuration for enterprise deployment [4].
- An archived Internet Archive collection ("skypeversions") hosts historical Skype-for-Windows installer builds, including files named Skype260103.exe and CyberPhoneK-setup.exe, evidencing pre-3.x (2.6.x) builds existed alongside the 3.x line [5].

## Settings and UI

- End users can control the Skype automatic update-notification feature via Tools > Options > Advanced [4].
- A user may select Help > Check for Updates from the Skype main window; this launches the default web browser and displays a message indicating whether the installed version is up to date [4].
- Since Skype 3.0's release in 2006, the client supports centrally managed policy settings via Windows Group Policy and a Skype-v1.5.adm administrative template, applied through registry keys [4].
- Managed settings precedence in Skype for Windows 3.0+ is, from highest to lowest: HKLM registry keys, then HKCU registry keys, then shared/config.xml client settings, then the user's own preferences/defaults [4].
- A ListenHTTPPortsPolicy governs whether the client listens on HTTP (port 80) and HTTPS (port 443) as fallback connection ports; when not configured, the choice is left to the user's Options [4].
- A DisableFileTransferPolicy can disable file transfer, preventing the user from sending and receiving files using Skype [4].
- A DisableContactImportPolicy can disable contact import [4].
- A DisablePersonalisePolicy can "disable personalization to prevent the user from changing sounds" [4].
- A WebStatusPolicy controls whether a user's online status can be published on the web via Skype buttons: enabled always publishes it, disabled prevents publishing [4].
- A DisableApiPolicy can disable the Skype Public API, preventing third-party applications from accessing Skype functionality [4].
- A memory-only mode policy makes Skype run without storing any data on the local disk [4].
- Network-related policies include ListenPort, DisableTCPListenPolicy, DisableUDPPolicy, DisableSupernodePolicy, and a set of ProxyPolicy/ProxyType options (Unset, Automatic, Disabled, HTTPS, SOCKS5) with Address/Username/Password fields, mirroring the Connection tab of Tools > Options [4].
- Skype 3.0's networking changes altered UDP packet length and the way encrypted UDP channels are opened between clients, breaking prior Skype-blocking network filters [6].
- The registry key HKEY_LOCAL_MACHINE\Software\Policies\Skype\Phone (and the equivalent HKEY_CURRENT_USER path), value DisableFileTransfer (REG_DWORD, 0 or 1), implements the file-transfer policy above [4].
- The registry key HKEY_CURRENT_USER\Software\Policies\Skype\Phone (and the equivalent HKEY_LOCAL_MACHINE path), value DisableContactImport (REG_DWORD, 0 or 1), implements the contact-import policy above [4].

## Presence and messaging

- Skype 3.0's new social features were called Extras and Public Chats; Extras "enables game playing and music recommendation through Last.fm" [1][2].
- Skype 3.0 introduced "Mood Messages", letting users "explain how they are feeling and what they are doing" to friends and family [1][2].
- Skype 3.0 added Public Chats, described as theme-based chat rooms; Skype previously had group chatting capabilities but not theme-based chat rooms [1][2].
- Stefan Oberg, GM of Telecoms & Desktop for Skype, described Public Chats as making it easier for people to make new friends, beyond the earlier model of conversations between people who already know each other [1].
- Skype 3.5 (August 2007) let users insert shared video content downloaded from video-sharing sites such as Daily Motion and Metacafe into their Skype "mood" message [7]; independently confirmed by Telecompaper's coverage of the same feature [18].
- The Skype Network Administrator's Guide advises administrators/users to "know who you're authorizing" and to block users making unwanted contact, and notes that everything in a user's profile is visible except e-mail addresses, which are masked for privacy [4].
- Since the release of Skype 3.0 in 2006, Skype has supported configuring client policy via Windows Group Policy Objects and registry keys, per the Network Administrator's Guide [4].

## Calling and notifications

- Video calling for Skype-to-Skype calls between two parties, introduced with the Skype 2.0 client, continued through the 3.x line (partly sourced — checked via a paraphrase rather than a verbatim quote) [8]. Independently, Skype's own blog dates one-on-one video calling to January 2006 with Skype 2.0 for Windows [14].
- Skype 3.5 (August 2007) added auto redial and the ability to transfer an incoming call to another person or group on Skype [7], independently confirmed by Telecompaper [18]. Note: AfterDawn's changelog places "Auto redial" and "Call Transfer" one point release earlier, in build 3.2.0.163 [3] — see the Differences section.
- With Skype 3.5, Skype Pro subscribers gained the option to forward calls onto a landline or mobile phone [7].
- SkypeOut was the original branding for the paid service letting Skype users call landline or mobile phones [8].
- The incoming-call service allowing landlines/mobiles to reach a Skype client was called SkypeIn (later renamed Online Number) until the SkypeIn name was retired in 2010 [8].
- Skype Credit balances are deactivated after 180 days of account inactivity, though they can be reactivated [8]; independently confirmed by Microsoft's own Skype support page [16].
- In December 2006, Skype announced a new SkypeOut pricing structure effective January 18, 2007, introducing connection fees for all SkypeOut calls [8]; independently confirmed by Telecoms.com [15].
- Skype 3.x's automatic-update notification could be controlled by end users via Tools > Options > Advanced [4].
- The Skype client does not update itself; instead it notifies the user when a more recent copy or critical patch is available, leaving the choice to upgrade to the user [4].
- Administrators could enforce a DisablePersonalisePolicy via Group Policy to prevent end users from changing Skype's notification/event sounds [4].
- Users could manually check for updates via Help > Check for Updates in the main window, which opened the default browser to show whether the installed version was current [4].

## Refuted or unresolved — from the skeptic sample

- Refuted: Skype announced 10-way conference calling on PCs in February 2006, per timelines.issarice.com [9]. An independent source, History of Branding's Skype history, places this announcement in May 2006 instead — a genuine date conflict between the two sources [13].
- Not supported: A claim that Skype 3.0 Beta for Windows was released on November 8, 2006, sourced to timelines.issarice.com [9], could not be found anywhere on that page on re-check; the quoted text does not appear there.
- Not supported: A claim, sourced to the same TechCrunch article as the Mood Messages description, that Skype 3.0 shipped as a beta around November 8, 2006 ahead of the December general release is not supported — the cited quote is the unrelated Mood Messages passage from the December 13, 2006 general-release article, and that article does not state a November beta date [1].
- Not supported: A claim that Skype 3.0's Public Chats were the same thing as "Skypecasts" is not supported. The TechCrunch source's actual text on Public Chats never mentions Skypecasts, and Skypecasts was a distinct, earlier (May 2006) up-to-100-participant voice feature, not the newly introduced text-based Public Chats [1].
- Not supported: A claim that Skype 3.5 (build 3.5.0.239) added "screen sharing enhancements" and "API improvements for window status notifications" is not supported by AfterDawn's changelog for that build, which shows neither item; the source itself notes screen sharing only appears starting with v4.0+ [3].
- Not supported: A claim that Skype and Logitech jointly announced "High Quality Video" for Skype in October 2007, sourced to a PCWorld review of "Free Video Call Recorder for Skype", is not supported — that article contains no mention of Logitech, "High Quality Video", or any such announcement [10].
- Unresolved: The claim that Skype had over 136 million users at the time of the 3.0 release [1] could not be independently confirmed; nearby figures found elsewhere (100 million registered users by April 2006, 171 million by a 2007 article) are consistent with continued growth but do not verify the 136 million figure specifically [17].

## Differences from the earlier research docs — from the critique's contradictions list

- Prior docs (skype-era-gaps.md §6a and the themes.ts comment) state that message editing arrived only in Skype 8 (July 2018), gated exclusively to that era. New evidence contradicts this: AfterDawn's changelog for Skype 3.2 (build 3.2.0.163, 2007) lists "Edit chat messages" as a new feature over a decade earlier [3].
- Prior docs (skype-era-research.md) date auto-redial and call transfer to Skype 3.5 (2007), sourced to TechCrunch. New evidence shows AfterDawn's changelog for build 3.2.0.163 — one point release earlier than 3.5 — already lists "Auto redial" and "Call Transfer" as new features [3].
- Prior docs (skype-era-research.md) state Skype Find and Skype Prime "arrive in 3.1-3.5". New evidence places "Skype Find" specifically in build 3.0.0.217, within the 3.0 line itself, earlier than the claimed window [3].
- Prior docs' "Things easy to forget" section lists SkypeIn/SkypeOut/Skype Credit/Skype Number only generically, with no enterprise/policy discussion. New evidence adds a documented settings layer absent from prior docs: Group Policy/registry-based administration since Skype 3.0 (2006), a precedence order (HKLM > HKCU > shared/config.xml > user prefs), specific policies (DisableFileTransferPolicy, DisableContactImportPolicy, DisablePersonalisePolicy, WebStatusPolicy, DisableApiPolicy, memory-only mode, ListenHTTPPortsPolicy, proxy options), plus SkypeOut/Skype Credit mechanics (180-day credit deactivation, the January 18, 2007 per-call connection fee, and the SkypeIn/Online Number rename) [4][8].
- Neither prior doc mentions any network-level or anti-detection change in Skype 3.0. New evidence shows Skype 3.0 changed UDP packet length and the way encrypted UDP channels are opened, specifically breaking prior Skype-blocking network filters [6].

## Remaining gaps — from the critique's gaps list

- The actual Tools > Options dialog layout and tabs (only registry/policy names are documented here, not the clickable UI).
- The default notification/event sound set and specific sound files (DisablePersonalisePolicy confirms sounds were customizable and lockable, but not what the defaults were).
- The full presence status list and picker UI (Online, Away, DND, Invisible, Skype Me, etc.) — only "Skype Me" is referenced in the verified evidence, the rest is undocumented here.
- Skype Find and Skype Prime feature details beyond their existence/approximate version (no description of the UI or the paid-expert marketplace itself).
- Emoticon set specifics for the 3.x era (which emoticons existed at 3.0 launch versus added later).
- The on-screen SkypeOut dial-pad layout and the exact contact-card/toolbar (Add, Search, Conference) visual design.

## Unverified / open questions — every source_unreachable claim and every UNSOURCED open question, clearly labelled as not confirmed this pass

None of the following are confirmed this pass; they are carried over as open questions or as claims whose sources could not be reached.

- UNSOURCED: Skype 3.2 introduced the "SVOPC" audio codec (from general knowledge / a Wikipedia mention that could not be fetched verbatim this run).
- UNSOURCED: Exact retail (calendar) release dates for Skype 3.1, 3.2, 3.5, 3.6, 3.8 — only build-relative changelog deltas were sourced, not calendar dates.
- UNSOURCED: Skype Credit, Skype Premium, SkypeIn/SkypeOut pricing tier details specific to the 3.x era.
- UNSOURCED: Business/enterprise integration details beyond the Network Administrator's Guide (e.g., Skype for SIP, Outlook integration).
- UNSOURCED: Skype 3.6's specific feature set, not found distinctly from 3.5/3.8 in the sources fetched.
- UNSOURCED: The Tools > Options tab list (commonly described elsewhere as General, Privacy, Notifications, Sounds, Call Forwarding, Connection, Advanced, Hotkeys) — not confirmed from a source fetched this run.
- UNSOURCED: The Skype 3.x main window layout (contacts list, Contacts/History/Dial pad tabs, separate chat and call windows, system tray icon) — not verified against a period source this run.
- UNSOURCED: The exact 3.x menu bar structure (Skype, Contacts, Conversations/Call, Tools, Help) — not confirmed from a fetched primary source.
- UNSOURCED: Whether specific Options categories were renamed or changed across 3.0-3.8 point releases.
- UNSOURCED: Skype 3.x presence statuses (Online, Away, Not Available, Do Not Disturb, Invisible, Skype Me, Offline) and their effect on contactability.
- UNSOURCED: The size and contents of the standard emoticon set plus any hidden/undocumented emoticon codes for this era.
- UNSOURCED: Whether group chat in this era had an admin/creator role with member-management commands.
- UNSOURCED: File transfer size limits in the Skype 3.x Windows client.
- UNSOURCED: IM edit/delete rules and chat-history retention window settings for this era.
- UNSOURCED: Contact request/authorization flow details (dialog wording, whether a message could accompany a request).
- UNSOURCED: Whether typing indicators existed in Skype 3.x IM windows (note: a typing indicator is listed for build 3.0.0.217 in the changelog evidence [3], but no independent confirmation of its user-facing behavior was verified this pass).
- UNSOURCED: Whether mojis/reactions, @mentions, and read receipts existed in this era — plausible as absent (pre-dating those features by years) but not directly sourced this run.
- UNSOURCED: The exact profile field list (Full Name, Skype Name, mood message, birthday, gender, homepage, etc.) shown in Skype 3.x's Options or profile editor.
- UNSOURCED: The Skype 3.x group audio conference call participant cap.
- UNSOURCED: The specific video codec and target resolution/frame rate for standard (non-HQV) webcam calls in Skype 3.x.
- UNSOURCED: Screen sharing availability in Skype 3.x — widely believed to have been added later (~Skype 4/5), not confirmed by a fetched source this run.
- UNSOURCED: The exact list and configurability of notification sound events (incoming call, incoming message, contact online, contact request) in Tools > Options > Notifications.
- UNSOURCED: Skype 3.1 (March 2007) specific new features (Skype Find, Skype Prime) beyond a brief search mention, not verified via direct fetch this run.
- Source-unreachable / dead ends encountered this pass: support.skype.com, betawiki.net, and Wayback Machine snapshots of old Skype support articles (blocked); O'Reilly's "Skype for Dummies" Chapter 4 on customizing Options (oreilly.com blocked); en.wikipedia.org/wiki/Skype (no 3.x version-specific detail found); en.wikipedia.org/wiki/Skype_protocol (no 2006-2008 detail found); filehippo.com version history (blocked host); cnet.com's Skype 3.0 review (could not be fetched); skaip.org history and old-features pages (503 errors / TLS mismatch); sherv.net hidden-emoticons page (503 error); a Skype video/bandwidth academic PDF (not fetched, budget).

## Sources — numbered list of every URL cited, with primary/secondary/tertiary

1. TechCrunch, "Skype Unveils 3.0" (AMP page) — https://techcrunch.com/2006/12/13/skype-unveils-30/amp/ — secondary
2. TechCrunch, "Skype Unveils 3.0" — https://techcrunch.com/2006/12/13/skype-unveils-30/ — secondary
3. AfterDawn, Skype version history — https://www.afterdawn.com/software/version_history.cfm/skype — secondary
4. Skype Network Administrator's Guide (hosted on Internet Archive, "manualzilla-id-6980017") — https://archive.org/details/manualzilla-id-6980017 — primary
5. Internet Archive item "skypeversions" (historical installer files) — https://archive.org/details/skypeversions — primary
6. Computerworld, "Networks beware: Skype 3.0 includes new cloaking technology" — https://www.computerworld.com/article/1503725/networks-beware-skype-3-0-includes-new-cloaking-technology.html — secondary
7. TechCrunch, "Skype 3.5 Steps Up Video Chat" — https://techcrunch.com/2007/08/07/skype-35-steps-up-video-chat — secondary
8. Wikipedia, "Skype Out" — https://en.wikipedia.org/wiki/Skype_Out — secondary
9. timelines.issarice.com, "Timeline of Skype" — https://timelines.issarice.com/wiki/Timeline_of_Skype — secondary
10. PCWorld, "Review: Free Video Call Recorder for Skype..." — https://www.pcworld.com/article/457241/review-free-video-call-recorder-for-skype-records-unlimited-video-and-audio-for-free.html — secondary
11. Telecompaper, "Skype launches Skype 3.0 for Windows" — https://www.telecompaper.com/news/skype-launches-skype-3-0-for-windows--540228 — tertiary
12. CIO.com, "Skype Debuts 100-Person Conferencing Feature" — https://www.cio.com/article/256830/voice-over-ip-skype-debuts-100-person-conferencing-feature.html — tertiary
13. History of Branding, "The History of Skype" — https://www.historyofbranding.com/the-history-of-skype/ — tertiary
14. Skype Blogs, "Ten Years of Skype Video: Yesterday, Today, and Something New" — https://blogs.skype.com/stories/2016/01/12/ten-years-of-skype-video-yesterday-today-and-something-new/ — tertiary
15. Telecoms.com, "Skype to charge connection fee" — https://www.telecoms.com/digital-ecosystem/skype-to-charge-connection-fee — tertiary
16. Microsoft Support, "How do I reactivate Skype Credit" — https://support.microsoft.com/en-us/skype/how-do-i-reactivate-skype-credit — tertiary
17. TechRadar, "How many people actually use Skype?" — https://www.techradar.com/news/phone-and-communications/mobile-phones/voip/internet/web/how-many-people-actually-use-skype-131887 — tertiary
18. Telecompaper, "Skype adds video downloads" — https://www.telecompaper.com/news/skype-adds-video-downloads--566260 — tertiary
