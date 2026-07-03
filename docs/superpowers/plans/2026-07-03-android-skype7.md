# Android Skype 7 Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the Skype 7 chrome and the web phase's features (presence, mood, contacts, emoticons, classic call screen) to the Kotlin/Compose Android app, and repair the app's broken `status_update` usage against the deployed server.

**Architecture:** MVVM — `PhazeViewModel` (MutableStateFlow + SharedPreferences `phaze_prefs`) over `NexusClient` WS. Chrome swaps in `MainActivity` when `theme == "skype7"` (default); new UI lands as new composables beside the existing screens. Calls stay on native WebRTC (`CallManager`, org.webrtc renderers) — restyle only.

**Tech Stack:** Kotlin, Jetpack Compose + Material 3, Gradle (`./gradlew` in `android/`, SDK per `local.properties`), JUnit 4 (added by this plan — repo has no JVM tests yet).

**Spec:** `docs/superpowers/specs/2026-07-03-android-skype7-design.md`

## Global Constraints

- Free/open-source assets only; no Microsoft-owned art or sounds.
- No Skype/Microsoft references in source beyond the existing `skype7` theme key.
- Code and commits read as hand-written; no AI attribution in commits.
- Wire format stays plain text (`(wave)`, `:)`); emoticons render at display time.
- Status strings exactly: `Online`, `Away`, `Do Not Disturb`, `Invisible` (settable), `Offline` (derived). Server validates `status_update` and rejects anything else.
- Skype 7 chrome gated on `theme == "skype7"`; other themes keep the Material shell.
- Every task ends with `cd android && ./gradlew assembleDebug` green (and `testDebugUnitTest` once Task 2 lands).
- **Spec amendment (locked here):** Android has no Live screen, so the tab strip is three tabs — Recent (clock) / Contacts (person) / Spaces (#). Settings moves to the header gear. The spec's "red dot Live" line does not apply to Android.

## Known code landmarks (verified 2026-07-03 — re-grep before editing)

- `android/app/src/main/java/world/phazechat/app/` is the source root (package `world.phazechat.app`).
- `data/PhazeViewModel.kt` (1659 lines): prefs = `phaze_prefs` (line ~75); state pattern `private val _x = MutableStateFlow(...); val x = _x.asStateFlow()`; `updateProfile` ~:733 sends the bad `status_update` with mood text; login-success block ~:1095-1110 sends `presence` with hardcoded `"Online"` (a second site ~:1155); `"update_result"` case ~:1208, `"profile_update"` ~:1214, `"friend_status", "presence"` ~:1225; `_theme` ~:265 (default `"skype7"`).
- `MainActivity.kt` ~:447-465: `var tab by remember { mutableIntStateOf(0) }` + `Scaffold(bottomBar = { NavigationBar { 3 items: Chats/Spaces/Settings } })`.
- `ui/ChatsScreen.kt` (292 lines): friends list rows; receives `friends: Map<String, FriendInfo>`.
- `ui/ChatScreen.kt` (393 lines): top bar with back/call/video/menu `IconButton`s ~:90-120; compose bar with attach ~:150 and `Icons.AutoMirrored.Filled.Send`.
- `ui/CallScreen.kt` (221 lines): props include `callStatus: String` (`"connected"` = active), `isIncoming`, WebRTC `VideoTrack`/`EglBase` — keep the signature, restyle the `Box` content.
- `ui/Theme.kt:56` `Skype7Colors = lightColorScheme(...)`, selected at :114.
- `data/NexusMessage.kt`: has `mood`, `status`, `body`, `displayName`, `supporter` fields; JSON via manual `put`/`str` mapping.
- `FriendInfo(username, status, mood, supporter)` in PhazeViewModel.kt:~30-35.
- `PhazeFCMService.kt`: push notifications via `NotificationCompat` (~:64).
- No `app/src/test/` directory; no `testImplementation` in `app/build.gradle.kts`.

---

### Task 1: Protocol repair + status state (PhazeViewModel)

**Files:**
- Modify: `android/app/src/main/java/world/phazechat/app/data/PhazeViewModel.kt`

**Interfaces:**
- Produces: `val myStatus: StateFlow<String>` (one of the four settable statuses), `fun setStatus(s: String)`, `val dnd: Boolean` derived getter (`myStatus.value == "Do Not Disturb"`). Prefs key: `"my_status"`. Task 3's picker calls `setStatus`; Task 3's mute checks `dnd`; the FCM service reads the same prefs key directly.

- [x] **Step 1: Add status state**

Next to `_theme` (~:265):

```kotlin
private val _myStatus = MutableStateFlow(prefs.getString("my_status", "Online") ?: "Online")
val myStatus = _myStatus.asStateFlow()
val dnd: Boolean get() = _myStatus.value == "Do Not Disturb"

private val settableStatuses = setOf("Online", "Away", "Do Not Disturb", "Invisible")

fun setStatus(s: String) {
    if (s !in settableStatuses) return
    val prev = _myStatus.value
    _myStatus.value = s
    prefs.edit().putString("my_status", s).apply()
    prefs.edit().putString("last_acked_status", prev).apply()
    nexus.send(NexusMessage(type = "status_update", body = s))
}
```

- [x] **Step 2: Handle status_result**

In the message `when` block, next to `"update_result"` (~:1208):

```kotlin
"status_result" -> {
    if (msg.error != null) {
        _myStatus.value = prefs.getString("last_acked_status", "Online") ?: "Online"
        _toast.value = msg.error   // reuse the existing toast/snackbar flow; grep `_toast` — if absent, use the same error surface `update_result` uses
    } else {
        msg.status?.let { prefs.edit().putString("last_acked_status", it).apply() }
    }
}
```

- [x] **Step 3: Fix updateProfile (the live breakage)**

Replace the body (~:733):

```kotlin
fun updateProfile(displayName: String, mood: String) {
    val me = _me.value ?: return
    _myDisplayName.value = displayName
    _myMood.value = mood
    nexus.send(NexusMessage(type = "update_profile", sender = me, displayName = displayName, mood = mood))
}
```

Add `_myMood`/`myMood` StateFlow next to `_myStatus` if not already present (grep `_myMood` first; create with `MutableStateFlow("")` seeded from the profile fetch or `update_result`).

- [x] **Step 4: Honest presence + login announce**

At both login/`presence` send sites (~:1102, ~:1155): replace `status = "Online"` with `status = _myStatus.value`. Immediately after the login-success presence send, add:

```kotlin
nexus.send(NexusMessage(type = "status_update", body = _myStatus.value))
```

- [x] **Step 5: Build + commit**

Run: `cd "/media/jack/New Volume/Skype/android" && ./gradlew assembleDebug`
Expected: BUILD SUCCESSFUL

```bash
git add app/src/main/java/world/phazechat/app/data/PhazeViewModel.kt
git commit -m "fix: stop sending mood as status_update, add real status state with revert"
```

---

### Task 2: Test infra + Kotlin emoticon tokenizer (TDD)

**Files:**
- Modify: `android/app/build.gradle.kts` (add `testImplementation("junit:junit:4.13.2")` in `dependencies`)
- Create: `android/app/src/main/java/world/phazechat/app/ui/Emoticons.kt`
- Test: `android/app/src/test/java/world/phazechat/app/EmoticonsTest.kt`

**Interfaces:**
- Produces:
  ```kotlin
  sealed class EmoToken { data class Text(val value: String) : EmoToken(); data class Emo(val id: String, val shortcut: String) : EmoToken() }
  data class Emoticon(val id: String, val shortcuts: List<String>, val emoji: String, val label: String)
  val EMOTICONS: List<Emoticon>            // same 20 ids as web/src/emoticons.ts
  fun tokenize(input: String): List<EmoToken>
  ```

- [x] **Step 1: Failing tests**

```kotlin
// android/app/src/test/java/world/phazechat/app/EmoticonsTest.kt
package world.phazechat.app

import org.junit.Assert.assertEquals
import org.junit.Test
import world.phazechat.app.ui.EmoToken
import world.phazechat.app.ui.tokenize

class EmoticonsTest {
    private fun flat(s: String) = tokenize(s).joinToString("") {
        when (it) { is EmoToken.Text -> it.value; is EmoToken.Emo -> "[${it.id}]" }
    }

    @Test fun wordShortcuts() = assertEquals("hi [wave] there", flat("hi (wave) there"))
    @Test fun symbolShortcuts() = assertEquals("ok [smile] bye [sad]", flat("ok :) bye :-("))
    @Test fun unknownParens() = assertEquals("call me (maybe)", flat("call me (maybe)"))
    @Test fun urlsUntouched() = assertEquals("see https://a.io/x:(y) ok", flat("see https://a.io/x:(y) ok"))
    @Test fun emoticonOnly() = assertEquals("[heart]", flat("(heart)"))
    @Test fun longestMatch() = assertEquals("[smile]", flat(":-)"))
}
```

Run: `cd android && ./gradlew testDebugUnitTest`
Expected: FAIL — unresolved reference `tokenize` (compile error counts as the red step).

- [x] **Step 2: Implement Emoticons.kt**

```kotlin
// android/app/src/main/java/world/phazechat/app/ui/Emoticons.kt
package world.phazechat.app.ui

sealed class EmoToken {
    data class Text(val value: String) : EmoToken()
    data class Emo(val id: String, val shortcut: String) : EmoToken()
}

data class Emoticon(val id: String, val shortcuts: List<String>, val emoji: String, val label: String)

// Mirrors web/src/emoticons.ts — same ids, same shortcuts, same fallbacks.
val EMOTICONS = listOf(
    Emoticon("smile", listOf("(smile)", ":-)", ":)"), "🙂", "Smile"),
    Emoticon("laugh", listOf("(laugh)", ":-D", ":D"), "😄", "Laugh"),
    Emoticon("wink", listOf("(wink)", ";-)", ";)"), "😉", "Wink"),
    Emoticon("sad", listOf("(sad)", ":-(", ":("), "🙁", "Sad"),
    Emoticon("cry", listOf("(cry)", ";'("), "😢", "Crying"),
    Emoticon("wave", listOf("(wave)", "(bye)"), "👋", "Wave"),
    Emoticon("heart", listOf("(heart)", "<3"), "❤️", "Heart"),
    Emoticon("kiss", listOf("(kiss)", ":-*", ":*"), "😘", "Kiss"),
    Emoticon("cool", listOf("(cool)", "8-)"), "😎", "Cool"),
    Emoticon("angry", listOf("(angry)", ":@"), "😠", "Angry"),
    Emoticon("surprised", listOf("(surprised)", ":-O", ":O"), "😮", "Surprised"),
    Emoticon("blush", listOf("(blush)", ":$"), "😊", "Blushing"),
    Emoticon("tongue", listOf("(tongue)", ":-P", ":P"), "😛", "Tongue out"),
    Emoticon("sweat", listOf("(sweat)", "(whew)"), "😅", "Sweating"),
    Emoticon("party", listOf("(party)"), "🥳", "Party"),
    Emoticon("sleepy", listOf("(sleepy)", "|-)"), "😪", "Sleepy"),
    Emoticon("think", listOf("(think)", ":-?"), "🤔", "Thinking"),
    Emoticon("yes", listOf("(yes)", "(y)"), "👍", "Thumbs up"),
    Emoticon("no", listOf("(no)", "(n)"), "👎", "Thumbs down"),
    Emoticon("hug", listOf("(hug)"), "🤗", "Hug"),
)

private val byShortcut: Map<String, String> =
    EMOTICONS.flatMap { e -> e.shortcuts.map { it to e.id } }.toMap()
// Longest first so ":-)" wins over ":)" at the same position.
private val allShortcuts = byShortcut.keys.sortedByDescending { it.length }
private val urlRe = Regex("""https?://\S+""")

fun tokenize(input: String): List<EmoToken> {
    val out = mutableListOf<EmoToken>()
    val text = StringBuilder()
    var i = 0
    fun flush() { if (text.isNotEmpty()) { out.add(EmoToken.Text(text.toString())); text.clear() } }
    outer@ while (i < input.length) {
        val url = urlRe.matchAt(input, i)
        if (url != null) { text.append(url.value); i += url.value.length; continue }
        for (s in allShortcuts) {
            if (input.startsWith(s, i)) {
                flush()
                out.add(EmoToken.Emo(byShortcut.getValue(s), s))
                i += s.length
                continue@outer
            }
        }
        text.append(input[i]); i++
    }
    flush()
    return out
}
```

- [x] **Step 3: Tests pass + commit**

Run: `cd android && ./gradlew testDebugUnitTest`
Expected: 6 tests pass.

```bash
git add app/build.gradle.kts app/src/test app/src/main/java/world/phazechat/app/ui/Emoticons.kt
git commit -m "feat: emoticon tokenizer on android, first jvm unit tests"
```

---

### Task 3: PresenceBadge, status picker sheet, DND mute

**Files:**
- Create: `android/app/src/main/java/world/phazechat/app/ui/Presence.kt`
- Modify: `android/app/src/main/java/world/phazechat/app/PhazeFCMService.kt` (~:64), `MainActivity.kt` (wire sheet state — full header lands in Task 4)

**Interfaces:**
- Consumes: `vm.myStatus`, `vm.setStatus` (Task 1).
- Produces: `@Composable fun PresenceBadge(status: String, size: Dp = 12.dp)`; `@Composable fun StatusPickerSheet(current: String, onPick: (String) -> Unit, onDismiss: () -> Unit)`. Tasks 4–5 place `PresenceBadge` in the header, contact rows, and chat top bar.

- [x] **Step 1: Presence.kt**

```kotlin
// android/app/src/main/java/world/phazechat/app/ui/Presence.kt
package world.phazechat.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

val STATUSES = listOf("Online", "Away", "Do Not Disturb", "Invisible")

/** Skype-7-style presence dot, drawn by hand — no third-party art. */
@Composable
fun PresenceBadge(status: String, size: Dp = 12.dp) {
    Canvas(modifier = Modifier.size(size)) {
        val r = this.size.minDimension / 2f
        val c = Offset(r, r)
        when (status) {
            "Online" -> {
                drawCircle(Color(0xFF7BA700), r, c)
                val p = Path().apply {
                    moveTo(r * 0.55f, r * 1.05f); lineTo(r * 0.9f, r * 1.4f); lineTo(r * 1.5f, r * 0.65f)
                }
                drawPath(p, Color.White, style = Stroke(width = r * 0.28f))
            }
            "Away" -> {
                drawCircle(Color(0xFFFCAF17), r, c)
                val p = Path().apply { moveTo(r, r * 0.5f); lineTo(r, r * 1.05f); lineTo(r * 1.4f, r * 1.3f) }
                drawPath(p, Color.White, style = Stroke(width = r * 0.25f))
            }
            "Do Not Disturb" -> {
                drawCircle(Color(0xFFE4141B), r, c)
                drawLine(Color.White, Offset(r * 0.5f, r), Offset(r * 1.5f, r), strokeWidth = r * 0.3f)
            }
            else -> { // Offline / Invisible
                drawCircle(Color(0xFFA9A9A9), r * 0.85f, c, style = Stroke(width = r * 0.26f))
                drawLine(Color(0xFFA9A9A9), Offset(r * 0.65f, r * 0.65f), Offset(r * 1.35f, r * 1.35f), strokeWidth = r * 0.22f)
                drawLine(Color(0xFFA9A9A9), Offset(r * 1.35f, r * 0.65f), Offset(r * 0.65f, r * 1.35f), strokeWidth = r * 0.22f)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StatusPickerSheet(current: String, onPick: (String) -> Unit, onDismiss: () -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.padding(bottom = 24.dp)) {
            STATUSES.forEach { s ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickableRow { onPick(s); onDismiss() }
                        .padding(horizontal = 20.dp, vertical = 12.dp),
                ) {
                    PresenceBadge(s)
                    Spacer(Modifier.width(12.dp))
                    Text(s, style = MaterialTheme.typography.bodyLarge,
                        fontWeight = if (s == current) androidx.compose.ui.text.font.FontWeight.Bold else null)
                }
            }
        }
    }
}
```

`clickableRow` is `androidx.compose.foundation.clickable` — import it and use `.clickable { ... }` directly (the name above is illustrative; write `.clickable`).

- [x] **Step 2: DND gates FCM notifications**

In `PhazeFCMService` before building the notification (~:64):

```kotlin
val prefs = getSharedPreferences("phaze_prefs", MODE_PRIVATE)
if (prefs.getString("my_status", "Online") == "Do Not Disturb") return
```

(Place at the top of the message-received handler so DND drops the ping entirely; message data still syncs over WS when the app opens.)

- [x] **Step 3: Build + commit**

Run: `cd android && ./gradlew assembleDebug testDebugUnitTest` — Expected: green.

```bash
git add app/src/main/java/world/phazechat/app/ui/Presence.kt app/src/main/java/world/phazechat/app/PhazeFCMService.kt
git commit -m "feat: presence badge + status picker sheet, dnd drops notification pings"
```

---

### Task 4: Skype 7 chrome — blue header + three-tab strip

**Files:**
- Create: `android/app/src/main/java/world/phazechat/app/ui/Skype7Chrome.kt`
- Modify: `android/app/src/main/java/world/phazechat/app/MainActivity.kt` (~:447 Scaffold)

**Interfaces:**
- Consumes: `vm.theme`, `vm.me`, `vm.myStatus`, `vm.myMood` (Task 1), `PresenceBadge`, `StatusPickerSheet` (Task 3).
- Produces: `@Composable fun Skype7Header(me: String, status: String, mood: String, onStatusClick: () -> Unit, onMoodClick: () -> Unit, onSettings: () -> Unit)`; `@Composable fun Skype7Tabs(selected: Int, onSelect: (Int) -> Unit)` — tab indices: 0 Recent, 1 Contacts, 2 Spaces. Task 5 renders tab content.

- [x] **Step 1: Skype7Chrome.kt**

```kotlin
// android/app/src/main/java/world/phazechat/app/ui/Skype7Chrome.kt
package world.phazechat.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val SkypeBlue = Color(0xFF00AFF0)

@Composable
fun Skype7Header(
    me: String,
    status: String,
    mood: String,
    onStatusClick: () -> Unit,
    onMoodClick: () -> Unit,
    onSettings: () -> Unit,
) {
    Column(Modifier.background(SkypeBlue).statusBarsPadding()) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
        ) {
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier.size(38.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.25f)),
            ) {
                Text(me.take(1).uppercase(), color = Color.White, fontWeight = FontWeight.Bold)
                Box(Modifier.align(Alignment.BottomEnd)) { PresenceBadge(status, 11.dp) }
            }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(me, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clickable(onClick = onStatusClick)) {
                    PresenceBadge(status, 9.dp)
                    Spacer(Modifier.width(4.dp))
                    Text(status, color = Color.White.copy(alpha = 0.9f), fontSize = 11.sp)
                }
            }
            IconButton(onClick = onSettings) {
                Text("⚙", color = Color.White, fontSize = 18.sp)
            }
        }
        Text(
            text = mood.ifEmpty { "Share what’s on your mind…" },
            color = Color.White.copy(alpha = if (mood.isEmpty()) 0.6f else 0.9f),
            fontSize = 12.sp,
            fontStyle = if (mood.isEmpty()) FontStyle.Italic else null,
            maxLines = 1,
            modifier = Modifier.fillMaxWidth().clickable(onClick = onMoodClick).padding(horizontal = 14.dp).padding(bottom = 8.dp),
        )
    }
}

@Composable
fun Skype7Tabs(selected: Int, onSelect: (Int) -> Unit) {
    Row(Modifier.fillMaxWidth().background(SkypeBlue)) {
        listOf("recent", "contacts", "spaces").forEachIndexed { i, id ->
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.weight(1f).clickable { onSelect(i) }.padding(top = 6.dp),
            ) {
                TabIcon(id, active = selected == i)
                Spacer(Modifier.height(5.dp))
                Box(
                    Modifier.fillMaxWidth().height(3.dp)
                        .background(if (selected == i) Color.White else Color.Transparent)
                )
            }
        }
    }
}

/** Hand-drawn tab glyphs matching the web sidebar icons. */
@Composable
private fun TabIcon(id: String, active: Boolean) {
    val tint = if (active) Color.White else Color.White.copy(alpha = 0.65f)
    Canvas(Modifier.size(20.dp)) {
        val w = size.width
        val stroke = Stroke(width = w * 0.09f)
        when (id) {
            "recent" -> { // clock
                drawCircle(tint, w * 0.38f, center, style = stroke)
                val p = Path().apply { moveTo(w * 0.5f, w * 0.3f); lineTo(w * 0.5f, w * 0.52f); lineTo(w * 0.66f, w * 0.62f) }
                drawPath(p, tint, style = stroke)
            }
            "contacts" -> { // person
                drawCircle(tint, w * 0.16f, Offset(w * 0.5f, w * 0.32f), style = stroke)
                val p = Path().apply {
                    moveTo(w * 0.2f, w * 0.85f)
                    cubicTo(w * 0.28f, w * 0.6f, w * 0.72f, w * 0.6f, w * 0.8f, w * 0.85f)
                }
                drawPath(p, tint, style = stroke)
            }
            "spaces" -> { // #
                val s = Stroke(width = w * 0.09f)
                drawLine(tint, Offset(w * 0.35f, w * 0.2f), Offset(w * 0.28f, w * 0.8f), s.width)
                drawLine(tint, Offset(w * 0.72f, w * 0.2f), Offset(w * 0.65f, w * 0.8f), s.width)
                drawLine(tint, Offset(w * 0.2f, w * 0.38f), Offset(w * 0.85f, w * 0.38f), s.width)
                drawLine(tint, Offset(w * 0.15f, w * 0.62f), Offset(w * 0.8f, w * 0.62f), s.width)
            }
        }
    }
}
```

- [x] **Step 2: Swap the shell in MainActivity**

At the Scaffold (~:447): when `theme == "skype7"`, drop `bottomBar` and render header + tabs above the content; keep the existing `NavigationBar` Scaffold for other themes. Tab mapping: 0 Recent → existing `ChatsScreen`, 1 Contacts → `ContactsTab` placeholder (`Text("Contacts")` until Task 5), 2 Spaces → existing `SpacesScreen`. Settings opens as it does today from its previous tab — route the header gear to the same destination (grep how `tab == 2` rendered `SettingsScreen` and reuse: keep a `showSettings` boolean that overlays `SettingsScreen`). Wire `StatusPickerSheet` visibility to a `showStatusSheet` boolean; `onPick = vm::setStatus`. Wire `onMoodClick` to a small `AlertDialog` with a `TextField` (140 cap) calling `vm.updateProfile(displayNameCurrent, newMood)` — grep how SettingsScreen calls `updateProfile` for the current display name source.

- [x] **Step 3: Build + commit**

Run: `cd android && ./gradlew assembleDebug` — Expected: green.

```bash
git add app/src/main/java/world/phazechat/app/ui/Skype7Chrome.kt app/src/main/java/world/phazechat/app/MainActivity.kt
git commit -m "feat: classic blue header and tab strip replace bottom nav under skype7"
```

---

### Task 5: Recent bands, ContactsTab, row presence + mood

**Files:**
- Create: `android/app/src/main/java/world/phazechat/app/ui/ContactsTab.kt`
- Modify: `android/app/src/main/java/world/phazechat/app/ui/ChatsScreen.kt`, `MainActivity.kt` (replace Contacts placeholder)

**Interfaces:**
- Consumes: `friends: Map<String, FriendInfo>` (`FriendInfo(username, status, mood, supporter)`), `PresenceBadge`, chat-open callback `onSelectChat(String)`.
- Produces: `@Composable fun ContactsTab(friends: Map<String, FriendInfo>, onOpen: (String) -> Unit)`.

- [x] **Step 1: ContactsTab**

```kotlin
// android/app/src/main/java/world/phazechat/app/ui/ContactsTab.kt
package world.phazechat.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import world.phazechat.app.data.FriendInfo

@Composable
fun ContactsTab(friends: Map<String, FriendInfo>, onOpen: (String) -> Unit) {
    val names = friends.keys.sortedWith(
        compareBy({ it.first().uppercaseChar() },
            { if ((friends[it]?.status ?: "Offline") != "Offline") 0 else 1 },
            { it.lowercase() })
    )
    LazyColumn {
        var last = ' '
        names.forEach { u ->
            val letter = u.first().uppercaseChar()
            if (letter != last) {
                last = letter
                item(key = "hdr-$letter") {
                    Text(
                        letter.toString(), fontSize = 11.sp, fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.outline,
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 4.dp),
                    )
                }
            }
            item(key = u) {
                val info = friends[u]
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth().clickable { onOpen(u) }.padding(horizontal = 14.dp, vertical = 9.dp),
                ) {
                    PresenceBadge(info?.status ?: "Offline")
                    Spacer(Modifier.width(10.dp))
                    Text(u, fontSize = 14.sp)
                    if (!info?.mood.isNullOrEmpty()) {
                        Spacer(Modifier.width(8.dp))
                        Text(info!!.mood!!, fontSize = 11.sp, color = MaterialTheme.colorScheme.outline, maxLines = 1)
                    }
                }
            }
        }
    }
}
```

(If `FriendInfo` lives in `PhazeViewModel.kt` without its own import path, import from `world.phazechat.app.data` as declared — grep the actual package line first.)

- [x] **Step 2: Recent bands + presence in ChatsScreen**

In the friends list rendering: sort rows by last-message time if a timestamp is available on the row model (grep ChatsScreen for how rows order today; if there is no timestamp, group all under one `Today` band — bands only appear when real data exists, do not fake times). Insert a band header composable when the day-bucket changes:

```kotlin
@Composable
private fun DateBand(label: String) {
    Text(
        label, fontSize = 11.sp, color = MaterialTheme.colorScheme.outline,
        modifier = Modifier.fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
            .padding(horizontal = 14.dp, vertical = 3.dp),
    )
}

private fun dayLabel(ts: Long): String {
    val cal = java.util.Calendar.getInstance()
    val today = cal.get(java.util.Calendar.DAY_OF_YEAR) to cal.get(java.util.Calendar.YEAR)
    cal.timeInMillis = ts
    val that = cal.get(java.util.Calendar.DAY_OF_YEAR) to cal.get(java.util.Calendar.YEAR)
    return when {
        that == today -> "Today"
        today.second == that.second && today.first - that.first == 1 -> "Yesterday"
        else -> java.text.SimpleDateFormat("EEEE, MMMM d", java.util.Locale.US).format(java.util.Date(ts))
    }
}
```

Each row also gets `PresenceBadge(info.status)` on the avatar corner (or leading the row, matching current row layout) and the mood as a subtitle when present.

- [x] **Step 3: Wire ContactsTab in MainActivity, build, commit**

Replace the Task 4 placeholder: `1 -> ContactsTab(friends = friends, onOpen = { vm.selectChat(it) })`.

Run: `cd android && ./gradlew assembleDebug testDebugUnitTest` — Expected: green.

```bash
git add app/src/main/java/world/phazechat/app/ui/ContactsTab.kt app/src/main/java/world/phazechat/app/ui/ChatsScreen.kt app/src/main/java/world/phazechat/app/MainActivity.kt
git commit -m "feat: contacts tab, date bands and presence on recent rows"
```

---

### Task 6: Emoticons in chat — EmoticonText, picker, Send message pill

**Files:**
- Create: `android/app/src/main/java/world/phazechat/app/ui/EmoticonUi.kt`
- Modify: `android/app/src/main/java/world/phazechat/app/ui/ChatScreen.kt` (message text render + compose bar ~:150, send button)

**Interfaces:**
- Consumes: `EMOTICONS`, `tokenize` (Task 2).
- Produces: `@Composable fun EmoticonText(text: String, modifier: Modifier = Modifier)`; `@Composable fun EmoticonPickerPanel(onPick: (String) -> Unit)`.

- [x] **Step 1: EmoticonUi.kt**

```kotlin
// android/app/src/main/java/world/phazechat/app/ui/EmoticonUi.kt
package world.phazechat.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.text.InlineTextContent
import androidx.compose.foundation.text.appendInlineContent
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.Placeholder
import androidx.compose.ui.text.PlaceholderVerticalAlign
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

private val Face = Color(0xFFFFD764)
private val Rim = Color(0xFFB98A00)
private val Ink = Color(0xFF5B4300)

/** One drawn face per id, same house style as the web set. Unicode fallback. */
@Composable
fun EmoticonGlyph(id: String, size: androidx.compose.ui.unit.Dp = 20.dp) {
    val known = EMOTICONS.any { it.id == id }
    if (!known) { Text(id); return }
    Canvas(Modifier.size(size)) { drawFace(id) }
}

private fun DrawScope.drawFace(id: String) {
    val w = size.width
    val c = center
    val stroke = Stroke(width = w * 0.06f)
    fun eyes(y: Float = 0.4f) {
        drawCircle(Ink, w * 0.055f, Offset(w * 0.34f, w * y))
        drawCircle(Ink, w * 0.055f, Offset(w * 0.66f, w * y))
    }
    fun face(color: Color = Face, rim: Color = Rim) {
        drawCircle(color, w * 0.45f, c)
        drawCircle(rim, w * 0.45f, c, style = stroke)
    }
    fun mouth(startX: Float, curveY: Float, endX: Float, down: Boolean = false) {
        val p = Path().apply {
            moveTo(w * startX, w * (if (down) 0.72f else 0.6f))
            quadraticBezierTo(w * 0.5f, w * curveY, w * endX, w * (if (down) 0.72f else 0.6f))
        }
        drawPath(p, Ink, style = Stroke(width = w * 0.07f))
    }
    when (id) {
        "smile" -> { face(); eyes(); mouth(0.3f, 0.78f, 0.7f) }
        "laugh" -> { face(); eyes(0.36f); drawCircle(Ink, w * 0.16f, Offset(w * 0.5f, w * 0.65f)) }
        "wink" -> { face(); drawCircle(Ink, w * 0.055f, Offset(w * 0.34f, w * 0.4f))
            drawLine(Ink, Offset(w * 0.58f, w * 0.4f), Offset(w * 0.74f, w * 0.4f), w * 0.06f); mouth(0.3f, 0.76f, 0.7f) }
        "sad" -> { face(); eyes(); mouth(0.3f, 0.58f, 0.7f, down = true) }
        "cry" -> { face(); eyes(); mouth(0.3f, 0.6f, 0.7f, down = true)
            drawCircle(Color(0xFF6FB9E8), w * 0.07f, Offset(w * 0.3f, w * 0.58f)) }
        "wave" -> { face(); eyes(); mouth(0.32f, 0.74f, 0.62f)
            drawCircle(Face, w * 0.11f, Offset(w * 0.88f, w * 0.3f)); drawCircle(Rim, w * 0.11f, Offset(w * 0.88f, w * 0.3f), style = Stroke(w * 0.04f)) }
        "heart" -> { val p = Path().apply {
                moveTo(w * 0.5f, w * 0.85f)
                cubicTo(w * 0.05f, w * 0.5f, w * 0.2f, w * 0.12f, w * 0.5f, w * 0.32f)
                cubicTo(w * 0.8f, w * 0.12f, w * 0.95f, w * 0.5f, w * 0.5f, w * 0.85f)
            }; drawPath(p, Color(0xFFE4141B)) }
        "kiss" -> { face(); eyes(); drawCircle(Color(0xFFE86A6A), w * 0.09f, Offset(w * 0.5f, w * 0.66f)) }
        "cool" -> { face(); drawLine(Ink, Offset(w * 0.2f, w * 0.4f), Offset(w * 0.8f, w * 0.4f), w * 0.16f); mouth(0.32f, 0.74f, 0.68f) }
        "angry" -> { face(Color(0xFFE86A4A), Color(0xFF9C3D22))
            drawLine(Ink, Offset(w * 0.26f, w * 0.3f), Offset(w * 0.42f, w * 0.38f), w * 0.05f)
            drawLine(Ink, Offset(w * 0.74f, w * 0.3f), Offset(w * 0.58f, w * 0.38f), w * 0.05f)
            eyes(0.46f); mouth(0.32f, 0.6f, 0.68f, down = true) }
        "surprised" -> { face(); eyes(0.38f); drawCircle(Ink, w * 0.11f, Offset(w * 0.5f, w * 0.66f)) }
        "blush" -> { face(); eyes()
            drawCircle(Color(0xFFF2A3A3), w * 0.07f, Offset(w * 0.22f, w * 0.56f))
            drawCircle(Color(0xFFF2A3A3), w * 0.07f, Offset(w * 0.78f, w * 0.56f)); mouth(0.34f, 0.74f, 0.66f) }
        "tongue" -> { face(); eyes(); mouth(0.3f, 0.7f, 0.7f)
            drawCircle(Color(0xFFE86A6A), w * 0.09f, Offset(w * 0.56f, w * 0.72f)) }
        "sweat" -> { face(); eyes(); drawLine(Ink, Offset(w * 0.32f, w * 0.66f), Offset(w * 0.68f, w * 0.66f), w * 0.06f)
            drawCircle(Color(0xFF6FB9E8), w * 0.08f, Offset(w * 0.82f, w * 0.24f)) }
        "party" -> { face(); eyes(0.46f); mouth(0.32f, 0.8f, 0.68f)
            val hat = Path().apply { moveTo(w * 0.42f, w * 0.16f); lineTo(w * 0.62f, w * 0.02f); lineTo(w * 0.64f, w * 0.24f); close() }
            drawPath(hat, Color(0xFF0095CC)) }
        "sleepy" -> { face()
            drawLine(Ink, Offset(w * 0.26f, w * 0.42f), Offset(w * 0.42f, w * 0.42f), w * 0.055f)
            drawLine(Ink, Offset(w * 0.58f, w * 0.42f), Offset(w * 0.74f, w * 0.42f), w * 0.055f); mouth(0.36f, 0.7f, 0.64f) }
        "think" -> { face(); eyes(0.42f)
            drawLine(Ink, Offset(w * 0.24f, w * 0.26f), Offset(w * 0.4f, w * 0.22f), w * 0.05f)
            drawLine(Ink, Offset(w * 0.36f, w * 0.68f), Offset(w * 0.52f, w * 0.66f), w * 0.06f) }
        "yes", "no" -> { // thumb, flipped for "no"
            val flip = id == "no"
            val p = Path().apply {
                moveTo(w * 0.3f, w * 0.5f); lineTo(w * 0.45f, w * 0.22f)
                quadraticBezierTo(w * 0.52f, w * 0.12f, w * 0.56f, w * 0.26f)
                lineTo(w * 0.52f, w * 0.44f); lineTo(w * 0.78f, w * 0.44f)
                quadraticBezierTo(w * 0.88f, w * 0.46f, w * 0.84f, w * 0.58f)
                lineTo(w * 0.76f, w * 0.85f); lineTo(w * 0.3f, w * 0.85f); close()
            }
            if (flip) { scale(1f, -1f) { drawPath(p, Face); drawPath(p, Rim, style = stroke) } }
            else { drawPath(p, Face); drawPath(p, Rim, style = stroke) }
        }
        "hug" -> { face(); eyes(); mouth(0.34f, 0.72f, 0.66f)
            drawLine(Rim, Offset(w * 0.06f, w * 0.6f), Offset(w * 0.3f, w * 0.9f), w * 0.08f)
            drawLine(Rim, Offset(w * 0.94f, w * 0.6f), Offset(w * 0.7f, w * 0.9f), w * 0.08f) }
        else -> { face(); eyes(); mouth(0.3f, 0.76f, 0.7f) }
    }
}

@Composable
fun EmoticonText(text: String, modifier: Modifier = Modifier) {
    val tokens = tokenize(text)
    val inline = mutableMapOf<String, InlineTextContent>()
    val annotated = buildAnnotatedString {
        tokens.forEach { t ->
            when (t) {
                is EmoToken.Text -> append(t.value)
                is EmoToken.Emo -> {
                    val key = "emo-${t.id}"
                    inline.getOrPut(key) {
                        InlineTextContent(Placeholder(1.3.em, 1.3.em, PlaceholderVerticalAlign.TextCenter)) {
                            EmoticonGlyph(t.id)
                        }
                    }
                    appendInlineContent(key, t.shortcut)
                }
            }
        }
    }
    Text(annotated, inlineContent = inline, modifier = modifier)
}

@Composable
fun EmoticonPickerPanel(onPick: (String) -> Unit) {
    LazyVerticalGrid(columns = GridCells.Fixed(8), modifier = Modifier.height(140.dp).padding(horizontal = 8.dp)) {
        items(EMOTICONS, key = { it.id }) { e ->
            Box(Modifier.padding(6.dp).clickable { onPick(e.shortcuts.first()) }) {
                EmoticonGlyph(e.id, 26.dp)
            }
        }
    }
}
```

- [x] **Step 2: Wire ChatScreen**

1. Message bubbles: find where message body text renders (grep `Text(` around the bubble composable) and replace the plain `Text(body)` with `EmoticonText(body)` — only for the display path; input and wire stay plain.
2. Compose bar (~:150): add a smiley `IconButton` (drawn `EmoticonGlyph("smile", 22.dp)`) toggling `var pickerOpen`; when open render `EmoticonPickerPanel(onPick = { draft += "$it " ; pickerOpen = false })` above the input row.
3. Send button: when `theme == "skype7"` (pass `theme: String` into ChatScreen or read from a CompositionLocal — follow how Theme.kt currently exposes it; a plain parameter matching existing style is fine) render a blue pill `Button(colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00AFF0))) { Text("Send message", fontSize = 13.sp) }` instead of the arrow `Icon`.

- [x] **Step 3: Build, test, commit**

Run: `cd android && ./gradlew assembleDebug testDebugUnitTest` — Expected: green.

```bash
git add app/src/main/java/world/phazechat/app/ui/EmoticonUi.kt app/src/main/java/world/phazechat/app/ui/ChatScreen.kt
git commit -m "feat: drawn emoticons in chat, picker panel, send message pill"
```

---

### Task 7: Call screen — teal classic chrome

**Files:**
- Modify: `android/app/src/main/java/world/phazechat/app/ui/CallScreen.kt`

**Interfaces:**
- Consumes: existing `CallScreen` signature (peer, isIncoming, callStatus, WebRTC tracks, callbacks) — unchanged.

- [ ] **Step 1: Restyle**

Keep all logic (elapsed timer, renderers, toggles). Replace the root `Box` background with the teal radial wash and restructure the ring-state layout:

```kotlin
// background — replaces the current solid/gradient:
Box(
    modifier = Modifier.fillMaxSize().background(
        Brush.radialGradient(
            colors = listOf(Color(0xFF1D5F7A), Color(0xFF123F53), Color(0xFF0C2C3B)),
            center = Offset(0.5f, 0f) /* use Brush.radialGradient overload with relative center via onGloballyPositioned or just linearGradient fallback: */
        )
    )
)
```

Compose's `Brush.radialGradient` takes absolute offsets — use the simpler faithful approximation:

```kotlin
Brush.verticalGradient(listOf(Color(0xFF1D5F7A), Color(0xFF123F53), Color(0xFF0C2C3B)))
```

Add, when not `isActive` (ringing/connecting):
- top-right wordmark: `Text("phaze", color = Color.White.copy(alpha = 0.14f), fontSize = 26.sp, fontWeight = FontWeight.SemiBold)` aligned `TopEnd`, 18.dp padding.
- centered column: 96.dp square avatar (`RoundedCornerShape(6.dp)`, `avatarColor`-style background — grep how other screens color avatars and reuse), peer name 22.sp SemiBold white, status line: `"calling"` + three dots animated by an `rememberInfiniteTransition` alpha stagger, or `"incoming ${if (isVideo) "video" else "audio"} call"` for incoming.
- bottom control bar: `Row` in a `Surface(color = Color(0xD00A1820), shape = RoundedCornerShape(50))` centered at the bottom with 14.dp padding — existing buttons (mute, camera, speaker) restyled as 48.dp circles; answer button `Color(0xFF5CB85C)`, hang-up `Color(0xFFE4141B)`.

Video-active state keeps the renderers full-bleed exactly as today; only the control bar restyles.

- [ ] **Step 2: Build + commit**

Run: `cd android && ./gradlew assembleDebug` — Expected: green.

```bash
git add app/src/main/java/world/phazechat/app/ui/CallScreen.kt
git commit -m "style: classic teal call screen, dark rounded control bar"
```

---

### Task 8: Full build + suite gate

- [ ] **Step 1: Everything green**

Run: `cd android && ./gradlew assembleDebug testDebugUnitTest`
Expected: BUILD SUCCESSFUL, 6+ unit tests passing.

- [ ] **Step 2: Install if a device is reachable**

Run: `cd android && adb devices` — if a device/emulator is listed: `./gradlew installDebug` and hand-check header, tabs, status picker, emoticons, call ring screen. If none: note it and leave device QA to the user.

- [ ] **Step 3: Commit any straggler fixes**

```bash
git add -A android/ docs/superpowers/plans/2026-07-03-android-skype7.md
git commit -m "chore: android skype7 pass — build and tests green"
```
