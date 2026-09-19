# Skype 8.x (Electron/"new Skype") (2017-2025)

## At a glance

- Microsoft moved the Skype service from a peer-to-peer to a central-server-based architecture in April 2017, ahead of the redesigned client. [4]
- The 2017 redesign was "not well-received, with numerous negative reviews and complaints that the new client broke existing functionality." [4]
- Skype 8.0 for desktop launched July 17, 2018, and Microsoft set September 1, 2018 as the date after which "only Skype 8.0 will function," discontinuing Skype 7.0 ("Skype Classic"). [1]
- The desktop app's underlying framework changed again on June 24, 2020, when Skype 8.61 (desktop) and Skype for Windows 10 v15 (Store app) both shipped Electron-based. [2]
- Microsoft announced on February 28, 2025 that Skype would remain available until May 5, 2025, after which it was retired; the Skype website now redirects to Microsoft Teams. [3][4]

## Changelog and platform

- Skype 8.0 launched on desktop July 17, 2018, with free HD video and screensharing calls, @mentions, a chat media gallery, and drag-and-drop file sharing up to 300MB. [1][5]
- At the July 2018 8.0 launch Microsoft said planned upcoming features included read receipts, private conversations, cloud-based call recording, and profile invites/group links. [1] Read receipts remained only a stated plan as of this launch; no ship date for them is confirmed in the sourced evidence (partly sourced).
- Microsoft's cutoff for Skype 7.0 ("Skype Classic") was September 1, 2018, after which "only Skype 8.0 will function." [1]
- The move to Electron in the June 24, 2020 8.61/v15 release removed: People app integration, Outlook sync, automatic Microsoft Account sign-in, process throttling, and the Windows share context menu feature. [2]
- Microsoft said the Electron migration was meant to "allow developers to easily adapt Skype for more platforms, such as Chrome OS." [2]
- The same 8.61/v15 Electron release added bulk contact deletion, improved call controls supporting 9 videos in a video call, background replacement, and Android Auto compatibility. [2]
- On February 28, 2025, Microsoft announced Skype would remain available until May 5, 2025, "giving users time to explore Teams and decide on the option that works best for them." [3]
- Current Skype subscription users could continue using their Skype Credits and subscriptions "until the end of their next renewal period." [3]
- Users could migrate to Teams by signing in with Skype credentials (chats and contacts appear automatically), or export their data (chats, contacts, call history) instead. [3]
- During the transition period, Teams users could call and chat with Skype users. [3]
- Skype was officially retired on May 5, 2025; the website now redirects to Microsoft Teams. [4]
- After retirement, an existing Skype Credit balance for outgoing calls could still be used via a Skype Dial Pad web application, but no new credit could be purchased. [4]

## Settings and UI

- Skype 8.0 (2018) supports HD (1080p) video calls with up to 24 people, and screen-sharing in calls. [5]
- Skype 8.0 added a chat media gallery for organizing shared content in conversations, plus support for @mentions in chats. [5]
- Skype 8.0 supports file and media sharing up to 300 MB. [5]
- Microsoft announced (as a planned feature at the July 2018 launch) built-in cloud call recording where "everyone in the call will be notified the call is being recorded," with recordings additionally including everyone's video and screen shares. [5]
- An end-to-end encrypted chat experience using the Signal Protocol was announced as coming to Skype 8.x, with messages and notifications for these conversations remaining "hidden in the chat list." [5]
- The Skype Windows Store (UWP) app, built on the same Skype 8 codebase as the desktop (Win32) app, has a Settings menu with General, Messaging, and Help & Feedback sections (partly sourced — substance confirmed, but the source paraphrases rather than showing literal breadcrumb text). [6]
- The desktop (Win32) variant of Skype 8 has options the Store (UWP) variant lacked: automatic startup at boot, system tray/notification area persistence, Cortana-suggested replies/emoticons/actions, chat history export, conversation text-size adjustment, and support for DirectShow camera inputs. [6]
- The UWP and desktop apps "look the same" because "they're both based on Skype 8." [6]
- Skype's "Highlights" feature (a Snapchat/Stories-style feature) let users snap a photo or video, decorate it with text and stickers, and post it for followers to view. [7]
- In September 2018 Skype rolled back part of its 2017-18 redesign, "ditching stories, squiggles and over-the-top color." [7]
- Skype's redesign was described as "much-debated" before it reached the desktop client in August 2017. [8]
- Microsoft added a dark mode to Skype around version 8.52 (~September 2019), reportedly with two dark variants and a "Use system setting" option — this claim's only source (mspoweruser.com) was unreachable this pass and is not confirmed (see Unverified section).

## Presence and messaging

- Skype status types and behavior (undated source, general to the client): "Online" is set automatically by default and lets contacts reach the user any way, with the sender getting immediate notification. [9]
- "Offline" is shown automatically when Skype is closed, or set manually; the user cannot receive calls or instant messages while in this state. [9]
- "Away" means the user has left the computer; they can still be messaged or called and will be notified, and may hear sound alerts if nearby. [9]
- "Do Not Disturb" means the user is online, but notifications arrive without sound — only a subtle badge near the taskbar icon. [9]
- "Invisible" shares the same icon as "Offline," so contacts cannot tell if a user is offline or invisible; the invisible user still receives notifications of messages/calls. [9]
- "Blocked" is shown to users the account owner has blacklisted; they see the owner as Offline and get no notification of their messages/calls until unblocked, at which point old messages/notifications are delivered. [9]
- "Unauthorized" appears for a user not on the viewer's contact list; messages/calls to them go through only if the recipient's Skype security settings allow contact from anyone. [9]
- The automatic "Away" trigger is configurable via Tools/Settings > General > "Show me as Away when I've been inactive for [x] minutes," and can be disabled by unchecking the option or setting it to 0. [9]
- Group chat text commands are split by chat type into P2P and cloud chats, and some commands are not supported in all versions of Skype. [10]
- `/add username(s)` adds specified Skype users to a chat (space-separated for multiple), supported in both P2P and cloud chats. [10]
- `/kick username` removes a user from a chat (they can rejoin); `/kickban username` removes them and revokes their right to return. [10]
- `/get admins`, `/get masters`, `/get helpers`, and `/get listeners` list chat members by role, and `/get role` shows the current user's role (see `/setrole`) (partly sourced — the source does not list "admin" as a `/setrole`-settable role name, only master/helper/listener). [10]
- `/createmoderatedchat` creates a group chat with moderation enabled, equivalent to `/newchat` followed by `/set options +MODERATED`. [10]
- `/set allowlist` and `/set banlist` manage who may join or is barred from a chat, using `+`/`-` prefixes on usernames. [10]
- `/get uri` creates a unique URL that can be used to invite new users into a Skype group chat. [10]
- `/golive` starts a group call involving all users in the chat. [10]
- `/history` loads the entire correspondence history of the active chat window. [10]
- Skype identifies cloud chats by a name containing `19:***@thread.skype`, versus P2P chats named like `#username$***`. [10]
- Skype's typing indicator can be disabled via Tools > Options > IM & SMS > IM Settings > Show Advanced Options, then unchecking "Show when I am typing." [11]
- Skype's Expression Picker (the smile icon in the IM window) offers emojis, GIFs, stickers, and Mojis. [12]
- Skype has a set of hidden emoticons not shown in the regular emoticon menu, some insertable only via specific text codes. [13]

## Calling and notifications

- Skype 8.0 (July 2018) supports HD (1080p) video calls including up to 24 people, plus screen-sharing in calls. [5]
- Skype 8.0's cloud call recording notifies everyone in the call that it is being recorded, and recordings additionally include everyone's video and screen shares. [5]
- In 2019, Skype added an option to blur the video call background using AI algorithms done purely in software, "despite a depth sensing camera not being present in most webcams." [14]
- On April 5, 2019, Skype doubled its video and audio group call participant limit from 25 to 50 people. [15]
- With this April 2019 expansion, Skype changed the default group-call notification sound to a less-distracting "ping" rather than the standard ring tone; calls with under 25 people kept the old group-wide ring behavior (partly sourced — the source does not confirm users could individually ring specific participants, which is not stated). [15]
- Skype's Notifications settings tab (reached via the triple-dot menu > Settings > Notifications) includes a "Contact comes online notification" toggle. [16]
- Skype users can call landline and mobile numbers (formerly branded SkypeOut) using Skype Credit or a calling subscription, and can purchase a Skype Number (formerly branded SkypeIn) so outside callers can reach their Skype client from a landline or mobile phone. [14]
- Group video calling and screen sharing (previously a paid "Skype Premium" feature, with screen sharing limited to 10 people) were made free in summer 2014 when the Premium product was removed, and this remained the baseline carried into the 8.x era. [14]

## Refuted or unresolved — from the skeptic sample

- All seven skeptic-checked claims in the sample were independently corroborated by a second, distinct-domain source: the July 17, 2018 desktop launch date (via Slashdot/tech.slashdot.org) [17]; the June 2020 Electron transition and its React-Native predecessor (via Neowin) [18]; the 24-person HD call limit (via SiliconANGLE) [19]; the April 5, 2019 doubling of the group-call limit to 50 (via MacRumors) [20]; the September 1, 2018 Skype 7.0 cutoff (via gHacks, which also notes it was later delayed to November 1 after user backlash) [21]; the May 5, 2025 retirement date (Wikipedia corroborating Microsoft's own blog); and the 300MB file-sharing limit (corroborated within the existing TechCrunch/MakeUseOf sources).
- Not confirmed by this evidence: that a Skype 8 preview first appeared "in October 2017" — the cited MakeUseOf article does not contain that specific date/quote as claimed (rejected). [1]
- Not confirmed: the description of 2018-era "bright, squiggly lines" indicating typing/unread messages was misattributed to the September 2018 rollback article, which instead describes removing "notifications with a squiggle shape cut out" — the squiggly-line description actually belongs to an August 2017 TechCrunch piece, a different URL than cited (rejected). [7]
- Not confirmed: a generic, placeholder "google.com/search" citation claiming Skype 8.x hides its menu bar by default and reveals it via Alt — this is not a real, checkable source (rejected).
- Not confirmed: that the 50-participant group-call limit was first tested with Skype Insider Preview beta users in March 2019 before the April 2019 public rollout — the cited MobileSyrup article contains no such detail (rejected). [15]

## Differences from the earlier research docs — from the critique's contradictions list

- An earlier research doc framed Electron as part of the July 2018 8.0 launch itself. The verified evidence instead shows Skype 8.61 (desktop) and Skype for Windows 10 v15 (Store), both Electron-based, only shipped June 24, 2020 — two years after the 8.0 launch — marking the actual framework transition; a separate source (Neowin) independently confirms the pre-Electron client was React-Native-based, not Electron. [2]
- An earlier research doc's "removed or broken relative to 7.x" list covered only the 2017→8.0 transition. The verified evidence shows a second, later removal wave accompanied the June 2020 Electron migration specifically: People app integration, Outlook sync, automatic Microsoft-account sign-in, process throttling, and the Windows share context menu. [2]
- An earlier research doc summarized "Reactions, @mentions, edit/delete" as all shipping together at the Skype 8.0 July 2018 launch. The verified evidence confirms @mentions at that launch, but contains no claim that message-level reactions shipped with 8.0 or at any later specific date — only an undated, general Expression Picker description (emojis/GIFs/stickers/Mojis) exists, and no evidence addresses edit/delete-message mechanics or ship date at all. [5][12]

## Remaining gaps — from the critique's gaps list

The following were identified as gaps in this evidence set and are not filled in by this pass:
- The full Settings menu taxonomy beyond General/Messaging/Help & Feedback (no Privacy, Audio & Video, Appearance, or Calling sections are confirmed).
- The exact notification-sound inventory across 8.x's lifetime (only the 2019 ping-vs-ring change for large calls is verified).
- Whether/when message "reactions" (distinct from the Expression Picker) actually shipped in 8.x.
- Edit/delete-message mechanics and ship date in 8.x.
- Participant-limit progression beyond the April 2019 jump to 50 (no evidence here corroborates a later "100" milestone).
- A feature-parity breakdown between the UWP/Store app and desktop app at any single point in time, beyond the 2018 comparison article and the 2020 Electron-removal list.

## Unverified / open questions — every source_unreachable claim and every UNSOURCED open question, clearly labelled as not confirmed this pass

Source_unreachable claims (not confirmed this pass):
- Dark mode added at Skype version 8.52 (~September 2019), with a regular dark theme (light-gray text), a high-contrast dark theme (white text on black), and a "Use system setting" option in Appearance settings — sole source (mspoweruser.com) was blocked by Cloudflare and could not be verified.
- Editing/deleting a Skype message via right-click "Edit Message"/"Remove Message," with recipients seeing an indicator but not the removed content — sole source (magicslides.app) returned a 404 and does not exist at the cited URL.

UNSOURCED open questions (not confirmed this pass):
- Skype 8.62 and 8.66 release notes on answers.microsoft.com were found in search results but not fetched this run.
- The exact date Skype 8.0 preview first appeared in 2017 (only "October 2017" from an unverifiable secondary claim).
- Details on Skype Premium/Wifi/Access retirement dates within the 8.x era.
- Business integrations (e.g., Skype for Business interop, Outlook.com integration specifics) in 8.x, beyond the noted removal of Outlook sync in 8.61.
- The full Tools/Settings dialog category list (Audio & Video, Notifications, Appearance, Privacy, Calling).
- The exact menu bar structure (File, Edit, View, Contacts, Conversations, Calls, Help), which varies by build per an unverified forum answer.
- Profile editor UI details (click profile picture to edit name/mood message/avatar) in the 8.x era.
- Tray icon behavior specifics for 8.x (minimize-to-tray option under Settings > General), sourced only secondhand via a UWP-vs-desktop comparison.
- The exact size of the standard Skype 8.x emoticon set (built-in emoticon count).
- Whether Skype 8.x supports @mentions specifically in group chats and how they are triggered (distinct from the general 8.0 @mentions claim).
- Whether Skype 8.x supports message reactions (like/heart) and which point release introduced them.
- Whether read receipts (seen/delivered indicators) exist in Skype 8.x 1:1 or group chats.
- The file-transfer size limit for Skype 8.x beyond the 300MB figure already confirmed at the 2018 launch.
- The exact time window allowed for editing/deleting a sent message in Skype 8.x.
- The full list of Skype 8.x profile fields and privacy controls in the Electron client's Settings/Privacy tab.
- Contact request/blocking flow specifics (e.g., "Block Contact" menu path, whether blocking also reports as spam) for the 8.x Electron UI.
- Whether Meet Now (launched ~April 2020) included call recording, background blur, and screen sharing identical to regular Skype group calls.
- The specific audio/video codecs used by Skype 8.x.
- Whether SkypeOut/SkypeIn branding was fully retired in favor of "Skype Credit"/"Skype Number" by a specific 8.x version/date.
- The full list of configurable notification-sound events and whether 8.x desktop retained per-event custom sound (WAV) import.
- The exact date Skype 8.x added end-to-end encrypted "Private Conversations" calls, and whether call recording was disabled during encrypted calls.

## Sources

1. https://www.makeuseof.com/tag/microsoft-skype-8-for-desktop/ — secondary
2. https://winaero.com/skype-8-61-and-skype-for-windows-10-v15-released-based-on-electron/ — secondary
3. https://www.microsoft.com/en-us/microsoft-365/blog/2025/02/28/the-next-chapter-moving-from-skype-to-microsoft-teams/ — primary
4. https://en.wikipedia.org/wiki/Skype — secondary
5. https://techcrunch.com/2018/07/16/skype-launches-a-new-desktop-app-with-hd-video-improved-chat-and-soon-encryption-and-call-recording — secondary
6. https://www.howtogeek.com/393368/download-skype-for-more-features-than-windows-10s-built-in-version/ — secondary
7. https://techcrunch.com/2018/09/03/skype-rolls-back-its-redesign-by-ditching-stories-squiggles-and-over-the-top-color — secondary
8. https://techcrunch.com/2017/08/17/skypes-much-debated-redesign-hits-the-desktop/ — secondary
9. http://www.skaip.org/skype-statuses — secondary
10. http://www.skaip.org/skype-chat-commands — secondary
11. https://www.laptopmag.com/articles/disable-skype-typing-indicator — secondary
12. https://www.emojiall.com/en/platform-skype — tertiary
13. https://noobie.com/hidden-skype-emoticons/ — tertiary
14. https://en.wikipedia.org/wiki/Features_of_Skype — secondary
15. https://mobilesyrup.com/2019/04/05/skype-group-call-limit/ — secondary
16. https://www.technipages.com/skype-how-disable-notifications-contact-online/ — tertiary
17. https://tech.slashdot.org/story/18/07/16/182254/skype-80-launches-on-desktop-with-full-hd-video-to-soon-get-encryption-and-call-recording-features — secondary (skeptic corroboration)
18. https://www.neowin.net/news/microsoft-officially-replaces-react-native-based-skype-on-windows-10-with-electron-version/ — secondary (skeptic corroboration)
19. https://siliconangle.com/2018/07/16/microsoft-rolls-hd-video-calling-new-features-skype/ — secondary (skeptic corroboration)
20. https://www.macrumors.com/2019/04/05/skype-doubles-group-call-limit-overtakes-facetime/ — secondary (skeptic corroboration)
21. https://www.ghacks.net/2018/07/16/skype-classic-7-0-stop-working/ — secondary (skeptic corroboration)

Not usable as sources this pass (unreachable/nonexistent, cited only in the Unverified section above): https://mspoweruser.com/how-to-enable-skypes-new-dark-mode-on-version-8/ ; https://www.magicslides.app/blog/how-to-delete-a-message-on-skype
