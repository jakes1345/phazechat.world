# Call windows, era by era

The in-call window was never documented well enough to copy. Period
screenshots were not available when this was written, so each era's call
screen in `web/src/call.css` is an **approximation** built from the era's
own window chrome plus the few layout facts found in text sources. It is
not pixel-accurate.

| Era | What the web app does | Basis |
| --- | --- | --- |
| Skype 3 | Small framed window with an XP Luna title bar and a beige toolbar | Era chrome only (Luna). Call layout unsourced. |
| Skype 4 | Large window with a glassy Aero title strip; video fills most of the screen | Reviews of 4.0 describe a very large video window ([Lifehacker JP](https://www.lifehacker.jp/article/skype40/)). Chrome from the era. |
| Skype 5 | Dark full-screen call; controls appear when the pointer is over the call | Skype 5 for Mac reveals small icons along the bottom on hover ([Ignore the Code](https://ignorethecode.net/blog/2011/03/30/skype_5/)). Applied here to the Windows-style theme too. |
| Skype 6 | Flat solid colour, square tiles, edge-to-edge button strip | Metro styling only. Skype 6's call window layout unsourced. |
| Skype 7 | Teal full-screen call with a rounded control bar (the original design) | Not changed. |

Not built: Skype 5.6's "call monitor" popup (live video and basic controls
when you switch to another window, per
[BetaNews](https://betanews.com/article/skype-5-6-for-windows-improves-video-calling/)),
and Skype 7's call-plus-chat split view
([BetaNews](https://betanews.com/2014/12/06/skype-for-windows-7-0-sports-redesigned-touch-friendly-interface)).

If you have real screenshots of any of these, put them in `refs/` and this
table can move from "approximation" to "sourced".
