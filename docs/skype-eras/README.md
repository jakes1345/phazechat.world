# Skype eras — research index

Six source-verified research passes, one per Phaze era theme, checking and
extending the project's earlier `skype-era-research.md` and
`skype-era-gaps.md`. See `GATING-DIFF.md` for what this research means for
`web/src/themes.ts`'s feature gating specifically.

| Doc | Claims (verified/partial/unreachable/rejected of total) | Most interesting finding |
|---|---|---|
| [skype3.md](./skype3.md) | 55/2/0/5 of 62 | `edit_message` — "Edit chat messages" is documented as a new feature in Skype 3.2 (build 3.2.0.163, 2007), a decade before the app's current Skype-8 gate. |
| [skype4.md](./skype4.md) | 49/3/2/4 of 58 | Screen sharing existed by 4.x, but was a paid, ~10-person-capped Premium feature for years, not the free capability the current gate implies. |
| [skype5.md](./skype5.md) | 20/4/4/8 of 36 (thinnest era — real Skype 5 screenshots and documentation are genuinely scarce online) | Group video's real story is a free 5-person beta in May 2010 — five months earlier than assumed — that then became a paid Premium feature in January 2011. |
| [skype6.md](./skype6.md) | 33/1/5/6 of 45 | Confirms Skype 6 added nothing to the conversation-feature set at all (account plumbing and the Messenger merge only) — and that group video stayed paid until April 28, 2014, deep into the 6.x era. |
| [skype7.md](./skype7.md) | 46/1/3/4 of 54 | Found zero verified evidence for Mojis at all — the September 2015 date the app's gate relies on comes only from the older, non-source-verified research doc. |
| [skype8.md](./skype8.md) | 57/3/2/4 of 66 | Found no evidence that message-level reactions or edit/delete mechanics ever shipped in real Skype — undercutting the assumption that these all launched together at the 8.0 release. |

See [GATING-DIFF.md](./GATING-DIFF.md) for the full feature-by-feature
comparison against `themes.ts`, a list of concrete corrections, real Skype
capabilities with no Feature modeled at all, and the most consequential
findings ranked by screen impact.

## Methodology

This research is source-verified: every claim stated as fact in the body of
each doc carries a citation to a URL that was actually fetched during the
research pass, not recalled from general knowledge. An adversarial verify
pass then re-fetched and checked each of those citations against the live
page content. A further critique pass cross-checked the surviving claims
against the app's prior docs (`skype-era-research.md`,
`skype-era-gaps.md`) to surface contradictions, and ran an independent
skeptic sample against the most consequential dated claims in each era.
Anything that couldn't be verified this way — a source that returned an
error, a claim traceable only to an AI-summarized search snippet rather than
a fetched page, or a genuinely open question — is labelled "Refuted or
unresolved" or "Unverified / open questions" rather than asserted as fact.
Only body-section claims count as evidence anywhere this research is used;
those two sections are deliberately excluded from `GATING-DIFF.md`'s
comparisons.

## Known limitation

This pass has lower claim volume than a fully exhaustive audit would, and
each era's skeptic re-check sampled a subset of claims rather than
re-verifying every single one — both deliberate, to fit one usage-budget
window. Skype 5 in particular is thin (20 of 36 claims verified) because
real screenshots and contemporaneous documentation for that specific
release are genuinely scarce online, not because the research pass was
less careful there. Some point releases and most exact UI/settings dialog
layouts (menu structures, Options tab contents, default sound files,
profile-editor fields) remain undocumented across every era. See each doc's
own "Remaining gaps" section for what's still missing era by era.
