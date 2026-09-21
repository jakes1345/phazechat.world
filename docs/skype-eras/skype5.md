# Skype 5.x (2010-2012)

## At a glance

- Skype 5.0 for Windows released October 14, 2010, the version that opened this era with deep Facebook integration, a beta group video calling feature, automatic call recovery, and a redesigned home dashboard [1][15].
- The 5.x line continued through at least 5.2 (Mac, July 2011), 5.5 (Windows, mid-2011), and a 5.11 Windows Beta (September 2012) before the era ends [1][3][5].
- The flagship feature of this era, group video calling, moved from a free beta (5-person cap, May 2010) to general availability (up to 10 total, October 2010) to a paid Skype Premium feature (January 2011) [11][9][2].

## Changelog and platform

- Skype 5.0 for Windows was released October 14, 2010, independently confirmed by a second outlet beyond the original announcement coverage [1][15].
- Skype 5.0 for Windows added: Facebook News Feed viewing and posting inside the Skype interface, calling and SMS to Facebook friends' phones, automatic call recovery for calls interrupted by internet problems, a free trial of group video calling, and an improved UI with a new home dashboard [1].
- Skype 5.0 beta (announced May 14, 2010, roughly five months before the October 2010 general release) supported group video calling for up to 5 people, offered free as part of the beta ahead of the "premium" feature rollout planned for later in 2010 [11][16].
- Skype 5.0's general release (October 2010) included a beta group video chat feature allowing up to nine other people (10 total including the user) (partly sourced — only one outlet gives this exact participant count for the general-release build) [9].
- Skype 5.1 for Mac ("business version") was reported as the vehicle for the January 2011 paid group video calling launch, priced at $4.99 for a day pass or $8.99 per month after a free seven-day trial (partly sourced — pricing and January 2011 date are confirmed, but the "5.1 for Windows" business-version framing is not verified in the source text) [2][17].
- Skype 5.2 for Mac was released July 5, 2011, adding group screen sharing during group video calls (previously screen sharing was one-to-one only), a call-control bar that keeps video visible while multitasking, and a new "Recents"/history section [3][18][19].
- Group video calling and group screen sharing in the Skype 5.2 era required a Skype Premium subscription costing between $4.49 and $8.99 per month, with $4.99 day passes available (partly sourced — the $4.49 low end is TechCrunch's figure; an independent outlet instead states $4.99/day or $8.99/month, a minor discrepancy in the exact floor price) [3][18].
- Skype 5.5 for Windows was released around the same time as Skype 5.2 for Mac (mid-2011), adding deep Facebook integration (low confidence — mentioned only as a companion detail in the Mac-focused article) [3].
- **Now confirmed** (the ghacks.net source [5] was Cloudflare-blocked on every earlier fetch attempt; refetched successfully this pass): Skype 5.11 for Windows Beta, released September 14, 2012, let users sign in directly with a Facebook or Microsoft account instead of creating a Skype account first. Facebook sign-in gave free Skype-to-Skype calling with Facebook contacts who also used Skype; Microsoft account sign-in additionally pulled in Messenger/Xbox/Hotmail/Outlook.com contacts and their presence. Accounts could be linked and merged rather than replaced. 5.11 also added 6 new interface languages (Thai, Croatian, Slovenian, Serbian, Catalan, Slovak), a back-catalog of previously-used profile photos, and an "updated design" [5].
- The narrower claim that build **5.10.0.116** specifically was a "stable" release remains unconfirmed — the ghacks.net article covers 5.11's features only and never mentions 5.10 by version number. No real, fetchable URL for that sub-claim has ever been identified in this doc (an earlier pass named "betanews.com" as its likely source but never pinned down an actual article URL); not re-verified this pass for lack of anything concrete to fetch.
- Exact release dates and changelog text for Skype 5.3, 5.6, 5.7, 5.8, 5.9, and 5.10 for Windows were not found within the research budget for this pass.

## Settings and UI

- **Visual reference found and verified this pass** (previously "no page fetched this pass confirmed the exact 5.x menu bar contents" — see below): a real, dated screenshot of Skype 5.0 for Windows, embedded in a contemporaneous October 2010 blog post about the release [22]. It shows the window titled "Skype - mjgr..." with a menu bar reading **Skype / Contacts / Call / View / Tools / Help** — six items, no separate "Conversation" menu. Below that: a green account banner with the signed-in user's name and a home icon; a "Make your free call to an ordinary phone" promo bar; two tabs, **Contacts** and **Recent**, each with an icon (person / clock); a search box; a contact list with small square photo avatars, a colored presence dot per row, and a phone-handset icon on rows with a landline number; "Add a contact" and "Call phones" links at the bottom; and a light-blue banner along the very bottom reading "N people online". Saved to `docs/skype-eras/refs/skype5-windows-mgraves-2010.png`.
- A second, independently dated reference — a November 2010 first-look article for the **Mac** Beta build, with screenshots explicitly labeled by date (visible timestamps read 11/3/10) [23] — confirms the same general layout (photo-avatar contact list, flat un-bubbled message log with bold sender name + inline timestamp, no colored message bubbles) but is the Mac build, not the Windows build this app's OS chrome models (`skype5` maps to Windows 7 chrome) — kept as corroborating context, not as the primary visual reference. Saved to `docs/skype-eras/refs/skype5-mac-beta-{contacts,chat}-disruptivetelephony-2010.jpg`.
- This resolves the open "exact 5.x menu bar contents" question for every classic-era doc (skype3.md, skype4.md, skype6.md, skype7.md each independently flagged this as unsourced/guessed) — the app's shared classic-era menu bar previously included a "Conversation" menu with one action ("Search this conversation") that doesn't appear in this real screenshot and was already duplicated by the chat header's own search icon. Removed from `web/src/App.tsx`.
- After logging in via Facebook Connect, Skype 5.0 for Windows let users see their Facebook News Feed inside the Skype interface, post status updates synced with their Skype mood message, and comment and like friends' updates and wall posts [1].
- Skype 5.0 for Windows let users call and SMS their Facebook friends' mobile phones and landlines directly from Skype (partly sourced — this specific mechanic is confirmed verbatim; a further claim that Skype-to-Skype calls to Facebook contacts who also use Skype were free was not confirmed in the source text) [1].
- Skype 5.0 for Windows featured an improved UI and a new home dashboard showing a feed of contacts' mood messages plus tutorials on Skype features [1].
- In Skype 5.0, the contact search screen featured images and mood messages and offered real-time results [9].
- **Checked this pass, does not support the claim as attributed**: the support.freedomscientific.com transcript [8] (403 on every earlier attempt; now reachable) turned out to be a JAWS screen-reader walkthrough of a much later, tab-based Settings redesign — categories are Account and profile / General / Appearance / Audio and video / Calling / Messaging / Notifications / Contacts / Help and feedback, opened with CTRL+COMMA, and it includes a "share location with Bing" toggle. That's the post-redesign Settings UI (Skype 8+ territory), not the 5.x "Tools > Options" dialog the claim described. The specific claim that 5.x's Options grouped Privacy/Notifications/Sounds/Hotkeys/Connection/Advanced (or that Privacy was reached via Tools > Options > Privacy > Blocked Contacts) is neither confirmed nor refuted by this source — it's simply the wrong era's UI, and remains unsourced for 5.x specifically.
- The profile editor's mood-message/avatar/Skype Name layout and tray-icon right-click menu specifics remain unsourced open questions (see below) — but the exact menu bar contents are now sourced; see above.
- Two claims about a "Call Quality information button" dialog and full-screen window drag behavior, sourced to a TechRadar article, were checked against that page's own metadata and found to describe Skype 4.0 from 2008, not the 5.x era — they are not stated as fact here (see Refuted or unresolved).

## Presence and messaging

- Skype 5.0 for Windows let users keep up to date with and interact with their Facebook news feed, including posting status updates, commenting, and liking directly from Skype [9].
- Skype 5.0's beta group video chat feature allowed chatting with up to nine other people (10 total including the user) at general release (partly sourced — only one outlet states this exact figure, and no independent source distinguishes it from the earlier 5-person beta cap; treated as unresolved by the skeptic pass) [9].
- Skype 5.5 (continuing at least into later builds) added hidden/secret emoticons typed as text codes beyond the standard emoticon panel, including: (facepalm)/(fail), (wfh) for Working From Home, (fingers)/(fingerscrossed)/(yn) for Fingers Crossed, (tumbleweed), (lalala)/(lala)/(notlistening), (waiting)/(forever)/(impatience), and (highfive)/(hifive)/(h5) — independently corroborated by a second, unrelated emoticon-reference site [10][20].
- The Skype 5.5 hidden-emoticon set also included 2 further unnamed hidden emoticons described as "Easter eggs" [10].
- No fetched source this pass confirmed the full list of 5.x presence statuses (Online, Away, Do Not Disturb, Invisible, Offline, Skype Me) with their exact behavioral definitions, group chat roles/commands, message history retention limits, IM edit/delete rules, typing indicators, file transfer limits, or whether read receipts/@mentions/reactions existed in 5.x — all remain unsourced open questions (see below).

## Calling and notifications

- Skype 5.0 for Windows introduced automatic call recovery, which reconnects calls interrupted by internet connection problems [1].
- Skype 5.0 beta (May 14, 2010) supported group video calling for up to 5 people, offered free ahead of a planned 2010 "premium" feature rollout — independently corroborated by a second outlet describing the same May 2010 beta announcement [11][16].
- Group video calling became a paid Skype Premium feature starting January 2011, priced at $4.99 for a day pass or $8.99 per month (after a free seven-day trial) — independently corroborated by a second, unrelated outlet describing the same January 2011 Premium launch and pricing [2][17].
- A claim that group video calling was limited to "3 or more people, up to a maximum of 10" for businesses at the January 2011 Premium launch could not be confirmed in the cited article's actual text and is not stated as fact (see Refuted or unresolved) [2].
- Skype 5.2 for Mac (July 5, 2011) added group screen sharing, letting users share documents, photos, and presentations with multiple people in one call, upgrading from the prior one-to-one-only screen sharing — independently confirmed by two further outlets [3][18][19].
- Accessing group video calling and group screen sharing in the Skype 5.2 era required a Skype Premium subscription costing between $4.49 and $8.99 monthly, with $4.99 day passes available (partly sourced — see the discrepancy on the low end noted above) [3][18].
- Around the same time as Skype 5.2 for Mac, Skype 5.5 for Windows was reported to have "just rolled out" with deep Facebook integration (low confidence, single-source detail within the Mac-focused article) [3].
- Skype 5.0 had at least one confirmed screen-sharing issue: the shared area could be partially cropped when resizing the window (partly sourced — the article's separate claims about high-resolution-hardware problems and incompatibility with screen sharing initiated from Skype for Mac 2.8 were not found in the fetched text) [12].
- SkypeOut-style calling to standard landlines and mobile phones required purchasing Skype Credit in advance for per-minute calling — independently confirmed via Microsoft's own current support documentation describing the same prepaid mechanism (formerly branded SkypeOut), though neither source gives 5.x-era-specific pricing [14][21].
- No fetched source this pass confirmed 5.x notification-sound configurability, native call recording, audio/video codec details, or in-call control (mute/hold/add participant) UI specifics; these remain unsourced open questions (see below).

## Refuted or unresolved — from the skeptic sample

- **Unresolved (not confirmed, not refuted):** whether Skype 5.0's October 2010 general release specifically supported "up to 9 others / 10 total" in group video chat, as opposed to that figure describing only a later or different build. Only Computerworld makes this exact claim; no independent source corroborates the specific figure at that specific release date [9].
- **Not supported:** the claim that group video calling for businesses was capped at "3 or more people, up to a maximum of 10" — this specific wording/limit was not found in the cited Engadget article; the article's actual confirmed content covers only pricing and the January 2011 launch date, not a participant cap [2].
- **Not supported:** the claim that Skype 5.0's call quality indicator sometimes incorrectly reported "medium quality" during an actual HD call — the real known-issue text found instead describes the indicator failing to warn when the microphone was muted in Windows settings, a different bug [12].
- **Not supported:** the claim that Skype 5.5.117 was optimized for Windows 8 while 5.3 crashed on launch under Windows 8 — the cited version-history page instead attributes a Windows 8 resource-usage fix to version 5.9.0.115 and describes only unspecified "earlier versions" crashing at startup, without naming 5.3 or 5.5.117 [13].
- **Not supported:** the claim that group video calling was "eventually made free for everyone on Windows, Mac and Xbox One" — the cited techlicious.com article does not contain any statement about the feature later becoming free or reaching Xbox One; a separate Forbes article that reportedly covers this (April 2014, i.e., after this era) could not be fetched (HTTP 403) and remains unconfirmed [11][6].
- **Wrong version scope (not this era):** claims about a "Call Quality information button" dialog, a 5-to-10-screen group video layout, and full-screen window drag behavior, all sourced to a TechRadar article — that page's own metadata dates it to 2008 and describes Skype 4.0, not Skype 5.x. These are not stated as fact for the 5.x era in this document [7].
- **Not usable as a source:** a claim about Skype 5.11 tightening Facebook/Microsoft sign-in integration, whose only offered source_url was a Google search-results query rather than a real article — excluded from the factual sections above.

## Differences from the earlier research docs — from the critique's contradictions list

- The prior era-research doc frames group video calling as "beta at launch (5.0, October 2010) ... up to 10 participants," citing a September 2010 announcement just ahead of the October release. The verified evidence instead shows two distinct milestones: a 5-person-capped beta announced/launched May 14, 2010 — five months earlier than the doc implies — followed by the October 14, 2010 general release, which (per a single source) already supported up to 10 total. The doc's "beta at launch, Oct 2010" framing conflates these two dates and understates how early the 5-person beta actually shipped [11][16][9].
- The prior gating table's basis column labels the 5-participant figure as "5.0 beta, Oct 2010," but independent confirmation places the 5-person beta in May 2010, not October 2010; October 2010 is instead when the (separately sourced) 10-person figure already existed at general release [9].
- The prior implementation-gaps doc treats screen sharing as "not implemented ... not era-gated" as a deliberate app-scope decision. That decision is not contradicted by the evidence, but the evidence does surface a real, dateable historical milestone the doc's gating omits: Skype 5.2 (July 2011) upgraded screen sharing from one-to-one only to group screen sharing during group video calls, gated behind Skype Premium [3].
- The prior era-research doc's 5.x section (2010) contains no mention of Skype Premium pricing anywhere. The verified evidence shows group video calling became a paid Premium feature in January 2011 ($4.99/day or $8.99/month), and by 5.2 (July 2011) both group video and group screen sharing required Skype Premium priced between roughly $4.49/$4.99 and $8.99 per month — this pricing history for the era's flagship feature is absent from the prior doc's 5.x narrative [2][3].

## Remaining gaps — from the critique's gaps list

- The exact hidden-emoticon codes introduced with Skype 5.5 (facepalm/fail, wfh, fingers/yn, tumbleweed, lalala/notlistening, waiting/impatience, highfive/h5, plus 2 unnamed Easter eggs) are missing from the project's emoticons appendix, which currently records only the ~72 standard emoticons and later (5.9/6.14) hidden additions [10][20].
- Skype 5.1's role and platform ("Windows business version") in the January 2011 group-video Premium rollout remains unverified — sources disagree on whether a distinct 5.1 build existed for that launch [2][17].
- Group-video/screen-share Premium pricing tiers for the 5.x era ($4.99 day pass, $8.99/month, low end variously $4.49 or $4.99) are missing from the era-research doc's 5.x section entirely [2][3][18].
- The precise chronology separating the May 2010 beta (5-person cap) from the October 2010 5.0 general release (already 10-person cap per one source) is muddled in the existing docs, which label both events "5.0 beta, Oct 2010" [11][16][9].
- Group screen sharing (5.2, July 2011) as a distinct, dateable historical milestone extending one-to-one screen sharing to multi-party is not reflected in the app's gating table, which currently dates "Screen sharing" only generically to Skype 4 [3].
- SkypeOut/Skype Credit calling mechanics (per-minute prepaid landline/mobile calling) for the 5.x era specifically are sourced only to an undated manual and a current Microsoft support page, with no era-specific pricing or UI detail captured [14][21].

## Unverified / open questions — every source_unreachable claim and every UNSOURCED open question, clearly labelled as not confirmed this pass

**Source-unreachable claims (not confirmed this pass):**

- Group video calling being made completely free (no Premium required) starting April 2014 across Windows, Mac and Xbox One (up to 10 people on PC/Mac, 4 on Xbox One) — this is outside the 2010-2012 window in any case, and forbes.com returned HTTP 403 on every fetch attempt (plain fetch and stealth-browser fetch, both retried this pass) [6].

**Resolved this pass** (were listed here previously; see the Changelog and Settings sections above for what's now sourced):

- Source [5] (ghacks.net, Cloudflare-blocked before) is now fetched directly and confirms the 5.11 Facebook/Microsoft sign-in claim. Source [4]'s Google-search placeholder is no longer the sole reference for that claim and can be treated as superseded.
- Source [8] (support.freedomscientific.com, 403 before) is now fetched directly — it turned out to describe a later, tab-based Settings redesign, not 5.x's Tools > Options dialog, so the specific claim it was cited for stays unsourced for this era, but for a different reason (wrong-era source, not an unreachable one).

**UNSOURCED open questions (not confirmed this pass):**

- Exact release dates and full changelog text for Skype 5.3, 5.6, 5.7, 5.8, 5.9, 5.10 for Windows were not found within budget.
- Skype Extras/API details, Skype Access, and Skype WiFi tie-ins to specific 5.x versions were not sourced this run.
- The claim about 5.10.0.116 being "stable" is attributed to an AI search summary, not a directly fetched primary quote, and no real URL for its likely source ("betanews.com") has ever been pinned down in this doc — not re-checked this pass for lack of anything concrete to fetch.
- A likely list of Skype 5.x Tools > Options categories (General, Privacy, Notifications, Sounds, Calls, IM & SMS, Advanced, Connection) could not be verified with a dated 5.x source this run.
- Details of the 5.x profile editor (mood message, avatar, Skype Name display) were not sourced verbatim this run.
- Tray icon behavior/right-click menu specifics for Skype 5.x were not sourced this run.
- CNET/PCWorld/ZDNet Skype 5.0/5.5 hands-on reviews and the archive.org skype-setup-5.0.0.156 item page were identified but not fetched due to budget limits.
- Skype 5.x presence statuses (Online, Away, Do Not Disturb, Invisible, Offline, Skype Me) and their exact behavioral definitions were not confirmed for the 5.x era specifically.
- Group chat roles (MASTER/HELPER/USER/LISTENER) and commands (/setrole, /kick, /kickban, /history, /topic, /add, /leave, /goadmin) as they applied specifically during Skype 5.x were seen only in search snippets, not verified via a fetched page.
- Group chat message history retention limit (400 messages or two weeks, HISTORY_DISCLOSED option) was seen only in a search snippet, not confirmed via a fetched primary source.
- IM edit/delete rules, typing indicator, and file transfer size limits specific to Skype 5.x were not found in any page fetched this run.
- Whether Skype 5.x had read receipts, @mentions, or Mojis/reactions — evidence strongly suggests no (read receipts arrived in 2018 per a search snippet), but this was not confirmed via a fetched primary source this run.
- Privacy controls and contact-request/blocking behavior specific to Skype 5.x versions were not covered by any page fetched this run.
- Skype 5.x group video call maximum participant count on Windows specifically (as opposed to the Mac beta) at each point release 5.0-5.11 was not established.
- The exact list of notification sound events (incoming call, IM, contact online) and whether they were user-configurable via Tools > Options > Notifications in Skype 5.x was not established.
- Whether call recording existed natively in Skype 5.x (believed to require third-party plugins, not built in until later versions) was not established.
- Codec details (e.g., SILK, VP7/VP8) used for audio/video in Skype 5.x specifically were not established.
- Exact SkypeOut per-minute rates and Skype Number/SkypeIn pricing current during the 2010-2012 window, tied to a dated source, were not established.
- In-call control specifics (mute, hold, add participant) UI details for Skype 5.x Windows were not established.

## Sources

1. https://techcrunch.com/2010/10/14/skype-5-0-for-windows-debuts-with-facebook-integration-call-recovery-and-more — secondary (news report)
2. https://www.engadget.com/2011-01-27-skype-5-0-hits-mac-with-group-video-calling-streamlined-interfa.html — secondary (news report)
3. https://techcrunch.com/2011/07/05/skype-5-2-for-mac-has-arrived-comes-with-group-screen-sharing-and-video-calls — secondary (news report)
4. https://www.google.com/search?q=Skype+5.11+for+Windows+Beta+tightens+Facebook+Microsoft+account+integration — not a usable source (search-results query, not a published article); superseded by source 5, fetched directly this pass
5. https://www.ghacks.net/2012/09/14/skype-beta-now-with-facebook-login-and-microsoft-account-access/ — secondary (news report); fetched successfully this pass (was Cloudflare-blocked before)
6. https://www.forbes.com/sites/amitchowdhry/2014/04/29/skypes-group-video-calling-service-is-now-free/ — secondary (news report); still unreachable this pass (403, plain and stealth-browser fetch both retried)
7. https://www.techradar.com/news/voip/internet/skype-s-new-videocalls-full-eye-to-eye-contact-395328 — secondary (news report); confirmed by page metadata to cover Skype 4.0 (2008), not 5.x
8. https://support.freedomscientific.com/teachers/lessons/6.3.5_Transcript-SkypeSettings.htm — secondary (instructional transcript); fetched successfully this pass (was 403 before) — describes a later Settings redesign, not 5.x
9. https://www.computerworld.com/article/2469532/skype-5-0-loves-facebook-and-video-chat--download-it-now.html — secondary (news report)
10. http://handytechtips.blogspot.com/2011/08/more-hidden-skype-emoticons-in-skype-55.html — secondary (blog post)
11. https://www.techlicious.com/blog/skype-launches-group-video-calling/ — secondary (news report)
12. https://www.oldversion.com/software/skype/skype-5-0-0-152/ — secondary (software archive/changelog)
13. https://www.afterdawn.com/software/version_history.cfm/skype — secondary (software version-history page)
14. https://manuals.playstation.net/document/en/psp/current/network/skype/skypeout.html — secondary (product manual, undated)
15. https://www.telecompaper.com/news/skype-launches-version-5-0-for-windows--762455 — secondary (news report; skeptic-pass corroboration of source 1)
16. https://www.findmysoft.com/news/skype-beta-5-0-for-windows-with-group-video-calling/ — secondary (news report; skeptic-pass corroboration of source 11)
17. https://techielobang.com/blog/2011/01/07/skype-announces-group-video-calling-availability-with-skype-premium/ — secondary (blog post; skeptic-pass corroboration of source 2)
18. https://www.macrumors.com/2011/07/05/skype-5-2-for-mac-adds-group-screen-sharing-video-call-control-bar/ — secondary (news report; skeptic-pass corroboration of source 3)
19. https://www.tweaktown.com/news/20110/skype_5_2_released_for_mac_includes_group_screen_sharing_and_video_calls/index.html — secondary (news report; skeptic-pass corroboration of source 3)
20. https://www.symbols-n-emoticons.com/p/hidden-skype-emoticons.html — tertiary (reference/aggregator site; skeptic-pass corroboration of source 10)
21. https://support.microsoft.com/en-us/skype/how-much-does-it-cost-to-call-mobiles-and-landlines-from-skype-e0750859-8e92-4c86-acc4-5e464db939bb — primary (Microsoft/Skype official support documentation; skeptic-pass corroboration of source 14, though describes current, not 5.x-era, pricing)
22. https://www.mgraves.org/2010/10/skype-the-new-skype-5-0-for-windows/ — secondary (blog post, October 2010); contains a real, dated screenshot of Skype 5.0 for Windows (`docs/skype-eras/refs/skype5-windows-mgraves-2010.png`) — the primary visual reference for this era, since `skype5`'s OS chrome models Windows 7
23. https://www.disruptivetelephony.com/2010/11/skype-50-beta-for-mac-os-x-a-first-look-with-screenshots.html — secondary (blog post, November 2010); contains multiple dated screenshots (visible timestamps 11/3/10) of the Skype 5.0 Beta for Mac (`docs/skype-eras/refs/skype5-mac-beta-{contacts,chat}-disruptivetelephony-2010.jpg`) — corroborating context for general layout, not the primary reference since it's the Mac build
