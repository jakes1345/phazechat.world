package world.phazechat.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import world.phazechat.app.data.ConvoInfo
import world.phazechat.app.data.FriendInfo

/** Real recency first, falling back to online-first/alpha when nobody has a lastTs yet. */
fun sortFriendsForRecent(friends: Collection<FriendInfo>): List<FriendInfo> =
    friends.sortedWith(
        compareByDescending<FriendInfo> { it.lastTs }
            .thenByDescending { it.status == "Online" }
            .thenBy { it.username }
    )

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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatsScreen(
    friends: Map<String, FriendInfo>,
    pending: List<String>,
    unread: Map<String, Int>,
    stories: List<Story> = emptyList(),
    me: String = "",
    onSelectChat: (String) -> Unit,
    onAddFriend: (String) -> Unit,
    onAcceptFriend: (String) -> Unit,
    onViewStory: (String) -> Unit = {},
    onAddStory: () -> Unit = {},
    searchResults: List<String> = emptyList(),
    onSearch: (String) -> Unit = {},
    onClearSearch: () -> Unit = {},
    convos: List<ConvoInfo> = emptyList(),
    onOpenConvo: (String) -> Unit = {},
    onCreateConvo: ((String, List<String>) -> Unit)? = null,
) {
    var addDialogOpen by remember { mutableStateOf(false) }
    var addName by remember { mutableStateOf("") }
    var groupDialogOpen by remember { mutableStateOf(false) }
    var groupName by remember { mutableStateOf("") }
    var groupMembers by remember { mutableStateOf(setOf<String>()) }

    Column(modifier = Modifier.fillMaxSize()) {

        // Header bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.primary)
                .padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "Phaze",
                color = Color.White,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f),
            )
            IconButton(onClick = { addDialogOpen = true }) {
                Icon(Icons.Default.Search, contentDescription = "Search contacts", tint = Color.White)
            }
            if (onCreateConvo != null) {
                IconButton(onClick = { groupDialogOpen = true; groupName = ""; groupMembers = emptySet() }) {
                    Text("＋#", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                }
            }
            IconButton(onClick = { addDialogOpen = true }) {
                Icon(Icons.Default.Add, contentDescription = "Add contact", tint = Color.White)
            }
        }

        // Stories row
        if (stories.isNotEmpty() || me.isNotEmpty()) {
            StoriesRow(stories = stories, me = me, onViewStory = onViewStory, onAddStory = onAddStory)
            Spacer(Modifier.height(4.dp))
            HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.5f))
        }

        // Pending friend requests
        if (pending.isNotEmpty()) {
            pending.forEach { from ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f))
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Avatar(from, 36)
                    Spacer(Modifier.width(12.dp))
                    Text(
                        "$from wants to connect",
                        modifier = Modifier.weight(1f),
                        fontSize = 13.sp,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    TextButton(
                        onClick = { onAcceptFriend(from) },
                        colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.primary),
                    ) {
                        Text("Accept", fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f))
            }
        }

        // Contacts list — real recency first; falls back to online-first/alpha
        // when nobody has a lastTs yet (fresh install, no history synced).
        val sorted = sortFriendsForRecent(friends.values)

        if (sorted.isEmpty() && convos.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("No contacts yet", fontWeight = FontWeight.SemiBold, fontSize = 15.sp, color = MaterialTheme.colorScheme.onSurface)
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "Tap + to add someone by username",
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                        fontSize = 13.sp,
                    )
                }
            }
        } else {
            LazyColumn {
                if (convos.isNotEmpty()) {
                    item(key = "groups-label") {
                        Text(
                            "Groups",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.outline,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
                        )
                    }
                    items(convos, key = { "convo-${it.id}" }) { convo ->
                        val count = unread[convo.id] ?: 0
                        GroupRow(convo, count) { onOpenConvo(convo.id) }
                        HorizontalDivider(
                            modifier = Modifier.padding(start = 72.dp),
                            color = MaterialTheme.colorScheme.outline.copy(alpha = 0.25f),
                        )
                    }
                }
                var lastBand = ""
                sorted.forEach { friend ->
                    // Bands only appear once we have a real timestamp to bucket —
                    // never invent one for a friend with no activity yet.
                    if (friend.lastTs > 0) {
                        val band = dayLabel(friend.lastTs)
                        if (band != lastBand) {
                            lastBand = band
                            item(key = "band-$band") {
                                Text(
                                    band,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.outline,
                                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
                                )
                            }
                        }
                    }
                    item(key = friend.username) {
                        val count = unread[friend.username] ?: 0
                        FriendRow(friend, count) { onSelectChat(friend.username) }
                        HorizontalDivider(
                            modifier = Modifier.padding(start = 72.dp),
                            color = MaterialTheme.colorScheme.outline.copy(alpha = 0.25f),
                        )
                    }
                }
            }
        }
    }

    // Create-group dialog
    if (groupDialogOpen && onCreateConvo != null) {
        AlertDialog(
            onDismissRequest = { groupDialogOpen = false },
            title = { Text("Create a group") },
            text = {
                Column {
                    OutlinedTextField(
                        value = groupName,
                        onValueChange = { groupName = it },
                        label = { Text("Group name") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(8.dp))
                    Text("Members", fontSize = 12.sp, color = MaterialTheme.colorScheme.outline)
                    Column(Modifier.heightIn(max = 220.dp)) {
                        friends.keys.sorted().forEach { u ->
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        groupMembers = if (u in groupMembers) groupMembers - u else groupMembers + u
                                    }
                                    .padding(vertical = 6.dp),
                            ) {
                                Checkbox(checked = u in groupMembers, onCheckedChange = null)
                                Spacer(Modifier.width(6.dp))
                                Text(u, fontSize = 14.sp)
                            }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        onCreateConvo(groupName, groupMembers.toList())
                        groupDialogOpen = false
                    },
                    enabled = groupName.isNotBlank() && groupMembers.isNotEmpty(),
                ) { Text("Create") }
            },
            dismissButton = { TextButton(onClick = { groupDialogOpen = false }) { Text("Cancel") } },
        )
    }

    // Add / search dialog
    if (addDialogOpen) {
        val closeAdd = { addDialogOpen = false; addName = ""; onClearSearch() }
        AlertDialog(
            onDismissRequest = closeAdd,
            title = { Text("Add contact") },
            text = {
                Column {
                    OutlinedTextField(
                        value = addName,
                        onValueChange = { addName = it; onSearch(it.trim()) },
                        label = { Text("Username") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(8.dp))
                    if (searchResults.isEmpty() && addName.isNotBlank()) {
                        Text("No matches", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
                    }
                    LazyColumn(modifier = Modifier.heightIn(max = 220.dp)) {
                        items(searchResults.filter { it != me }, key = { it }) { user ->
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Avatar(user, 32)
                                Spacer(Modifier.width(10.dp))
                                Text(user, modifier = Modifier.weight(1f), fontSize = 14.sp)
                                if (friends.containsKey(user)) {
                                    Text("✓ added", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                                } else {
                                    Button(
                                        onClick = { onAddFriend(user) },
                                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                                    ) { Text("Add", fontSize = 13.sp) }
                                }
                            }
                        }
                    }
                }
            },
            confirmButton = {
                Button(onClick = {
                    if (addName.isNotBlank()) { onAddFriend(addName.trim()); closeAdd() }
                }) { Text("Send Request") }
            },
            dismissButton = {
                TextButton(onClick = closeAdd) { Text("Cancel") }
            },
        )
    }
}

@Composable
fun GroupRow(convo: ConvoInfo, unreadCount: Int, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier.size(46.dp).clip(CircleShape).background(MaterialTheme.colorScheme.tertiary),
            contentAlignment = Alignment.Center,
        ) {
            Text(convo.name.firstOrNull()?.uppercase() ?: "#", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 18.sp)
        }
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(convo.name, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                "${convo.members.size} people",
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f),
                fontSize = 12.sp,
            )
        }
        if (unreadCount > 0) {
            Box(
                modifier = Modifier.size(20.dp).clip(CircleShape).background(MaterialTheme.colorScheme.error),
                contentAlignment = Alignment.Center,
            ) {
                Text(unreadCount.toString(), color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
fun FriendRow(friend: FriendInfo, unreadCount: Int, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Avatar(friend.username, 46, friend.status)
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    friend.username,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 14.sp,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (friend.supporter) {
                    Spacer(Modifier.width(4.dp))
                    Text("💙", fontSize = 12.sp)
                }
            }
            Spacer(Modifier.height(2.dp))
            Text(
                friend.mood ?: friend.status,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f),
                fontSize = 12.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (unreadCount > 0) {
            Spacer(Modifier.width(8.dp))
            Box(
                modifier = Modifier
                    .defaultMinSize(minWidth = 20.dp, minHeight = 20.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primary),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    if (unreadCount > 99) "99+" else "$unreadCount",
                    color = Color.White,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 5.dp),
                )
            }
        }
    }
}

@Composable
fun Avatar(name: String, size: Int, status: String? = null, cacheBust: Int = 0) {
    Box(contentAlignment = Alignment.BottomEnd) {
        Box(
            modifier = Modifier
                .size(size.dp)
                .clip(CircleShape)
                .background(avatarTint(name)),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                name.firstOrNull()?.uppercase() ?: "?",
                color = Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = (size / 2.6f).sp,
            )
            // Uploaded picture paints over the letter; a 404 leaves it alone.
            coil.compose.AsyncImage(
                model = "https://phazechat.world/api/v1/avatars/$name?v=$cacheBust",
                contentDescription = null,
                contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                modifier = Modifier.size(size.dp).clip(CircleShape),
            )
        }
        if (status != null && status != "Offline") {
            Box(
                modifier = Modifier
                    .size(13.dp)
                    .clip(CircleShape)
                    .background(Color.White),
                contentAlignment = Alignment.Center,
            ) {
                PresenceBadge(status, 10.dp)
            }
        }
    }
}

private val avatarPalette = listOf(
    Color(0xFF00AFF0), Color(0xFF0095CC), Color(0xFF019A00),
    Color(0xFFE67E22), Color(0xFF8E44AD), Color(0xFFC0392B),
    Color(0xFF16A085), Color(0xFF2980B9), Color(0xFFD35400),
)

fun avatarTint(name: String): Color {
    val idx = name.fold(0) { acc, c -> acc + c.code } % avatarPalette.size
    return avatarPalette[idx]
}
