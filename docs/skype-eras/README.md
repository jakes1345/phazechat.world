# Classic Skype release research

These are internal development notes, not user documentation. They record what each classic Skype release could actually do, so the era themes in the web app show the right features. The gating itself lives in `FEATURES_BY_ERA` in `web/src/themes.ts`.

There's one doc per theme. The theme ids in the code still use the Skype version numbers, while the labels people see in the app are Phaze 1 to Phaze 6+:

| Doc | Theme id | In-app label | Release covered |
|---|---|---|---|
| [skype3.md](./skype3.md) | `skype3` | Phaze 1 | Skype 3.x (2006-2008) |
| [skype4.md](./skype4.md) | `skype4` | Phaze 2 | Skype 4.x (2009-2010) |
| [skype5.md](./skype5.md) | `skype5` | Phaze 3 | Skype 5.x (2010-2012) |
| [skype6.md](./skype6.md) | `skype6` | Phaze 4 | Skype 6.x (2012-2014) |
| [skype7.md](./skype7.md) | `skype7` | Phaze 5 | Skype 7.x (2014-2018) |
| [skype8.md](./skype8.md) | `skype8` | Phaze 6+ | Skype 8.x (2017-2025) |

They check and extend two older, unsourced docs, [`../skype-era-research.md`](../skype-era-research.md) and [`../skype-era-gaps.md`](../skype-era-gaps.md). [GATING-DIFF.md](./GATING-DIFF.md) compares the findings with the feature gates in `themes.ts` and lists suggested corrections.

## Claim counts and main findings

Each `skypeN.claims.json` file lists every claim checked for that release and its verdict. The counts below come from those files, in the order supported / partly supported / source unreachable / rejected. For Skype 5, "rejected" covers 5 claims marked `not_supported` and 3 marked `wrong_version_scope` (true, but about a different version).

| Release | Claims | Main finding |
|---|---|---|
| Skype 3 | 55 / 2 / 0 / 5 of 62 | AfterDawn's changelog lists "Edit chat messages" as new in Skype 3.2 (build 3.2.0.163, 2007). The app had gated message editing to Skype 8. |
| Skype 4 | 49 / 3 / 2 / 4 of 58 | Screen sharing was in 4.x, but as a paid Premium feature until summer 2014. A 10-person cap is reported but couldn't be confirmed word for word in the source. |
| Skype 5 | 20 / 4 / 4 / 8 of 36 | Group video started as a free 5-person beta in May 2010, five months before the 5.0 release, then became a paid Premium feature in January 2011. This is the thinnest doc because screenshots and documentation from the period are hard to find. |
| Skype 6 | 33 / 1 / 5 / 6 of 45 | Skype 6 added nothing to the set of conversation features. Its changes were account sign-in and the Messenger merge. Group video stayed paid until April 28, 2014. |
| Skype 7 | 46 / 1 / 3 / 4 of 54 | No verified source mentions Mojis. The September 2015 date used for the Mojis gate comes only from the older unsourced doc. |
| Skype 8 | 57 / 3 / 2 / 4 of 66 | @mentions are confirmed at the 8.0 launch. Nothing confirms that message reactions shipped with 8.0 or at any specific date, and nothing covers edit or delete in 8.x. |

## What has changed in themes.ts since

GATING-DIFF.md describes the gates as they were when the research was done. Since then, `themes.ts` has applied its first three corrections:

- `edit_message` moved from Skype 8 to Skype 3.
- `delete_message` moved to Skype 7, as a lower bound rather than a confirmed date.
- `stories` moved to Skype 7, since Skype's Highlights feature shipped under the 7.x version number in August 2017.

The other suggestions are still open. These include lowering confidence in the `reactions` and `mojis` gates, marking screen sharing and group video as paid in the eras where they were, and removing `dark_mode` as an era gate.

## How the claims were checked

Every claim stated as fact in the body of an era doc cites a page that was actually fetched, not something recalled from memory. A second pass fetched each cited page again and checked the claim against what the page says. A third pass compared the surviving claims with the two older docs to find contradictions, and checked a sample of the most important dates against a second, independent source.

Anything that failed these checks is kept out of the main text. That covers sources that couldn't be loaded, claims that only appeared in a search-result summary, and open questions. They're listed in each doc's "Refuted or unresolved" and "Unverified / open questions" sections, and GATING-DIFF.md doesn't treat them as evidence.

## Limitations

Not every claim was re-checked against a second source. Only a sample per era was. Some point releases are missing, and most exact UI details are still undocumented for every era: menu structures, the contents of the Options dialog, default sounds and profile editor fields. Each doc ends with a "Remaining gaps" section listing what's missing for that release.
