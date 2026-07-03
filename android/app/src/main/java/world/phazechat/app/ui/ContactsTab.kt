package world.phazechat.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import world.phazechat.app.data.FriendInfo

/** Alphabetical contact list — letter headers, online before offline, mood inline. */
@Composable
fun ContactsTab(friends: Map<String, FriendInfo>, onOpen: (String) -> Unit) {
    if (friends.isEmpty()) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("No contacts yet", color = MaterialTheme.colorScheme.outline)
        }
        return
    }
    val names = friends.keys.sortedWith(
        compareBy(
            { it.first().uppercaseChar() },
            { if ((friends[it]?.status ?: "Offline") != "Offline") 0 else 1 },
            { it.lowercase() },
        )
    )
    LazyColumn {
        var last = ' '
        names.forEach { u ->
            val letter = u.first().uppercaseChar()
            if (letter != last) {
                last = letter
                item(key = "hdr-$letter") {
                    Text(
                        letter.toString(),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.outline,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 14.dp, vertical = 4.dp),
                    )
                }
            }
            item(key = u) {
                val info = friends[u]
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onOpen(u) }
                        .padding(horizontal = 14.dp, vertical = 9.dp),
                ) {
                    PresenceBadge(info?.status ?: "Offline")
                    Spacer(Modifier.width(10.dp))
                    Text(u, fontSize = 14.sp)
                    val mood = info?.mood
                    if (!mood.isNullOrEmpty()) {
                        Spacer(Modifier.width(8.dp))
                        Text(
                            mood,
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.outline,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
        }
    }
}
