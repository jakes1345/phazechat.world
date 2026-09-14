package world.phazechat.app

import org.junit.Assert.assertEquals
import org.junit.Test
import world.phazechat.app.data.FriendInfo
import world.phazechat.app.ui.sortFriendsForRecent

class RecentSortTest {
    @Test fun realActivityBeatsOnlineStatus() {
        val friends = listOf(
            FriendInfo("stale_online", status = "Online", lastTs = 0L),
            FriendInfo("recent_offline", status = "Offline", lastTs = 5000L),
        )
        val order = sortFriendsForRecent(friends).map { it.username }
        assertEquals(listOf("recent_offline", "stale_online"), order)
    }

    @Test fun mostRecentFirst() {
        val friends = listOf(
            FriendInfo("older", lastTs = 1000L),
            FriendInfo("newer", lastTs = 9000L),
        )
        val order = sortFriendsForRecent(friends).map { it.username }
        assertEquals(listOf("newer", "older"), order)
    }

    @Test fun fallsBackToOnlineThenAlphaWhenNoActivity() {
        val friends = listOf(
            FriendInfo("zed_online", status = "Online", lastTs = 0L),
            FriendInfo("amy_offline", status = "Offline", lastTs = 0L),
            FriendInfo("bob_online", status = "Online", lastTs = 0L),
        )
        val order = sortFriendsForRecent(friends).map { it.username }
        assertEquals(listOf("bob_online", "zed_online", "amy_offline"), order)
    }
}
