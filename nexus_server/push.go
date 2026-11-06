package main

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"regexp"
	"strings"
	"sync/atomic"
	"time"

	"firebase.google.com/go/v4/messaging"
	webpush "github.com/SherClockHolmes/webpush-go"
)

// Kinds of push. The apps use them to pick a notification channel and
// what a tap opens.
const (
	pushKindDM            = "dm"
	pushKindGroup         = "group"
	pushKindChannel       = "channel"
	pushKindMention       = "mention"
	pushKindMissedCall    = "missed_call"
	pushKindFriendRequest = "friend_request"
)

// maxFCMTokensPerUser bounds how many devices one account pushes to. The
// oldest registrations are dropped first.
const maxFCMTokensPerUser = 10

// pushNote is one notification for one person.
type pushNote struct {
	Title     string
	Body      string
	Kind      string
	Sender    string // whose chat a tap opens, for DMs, calls and requests
	ConvoID   string
	ServerID  string
	ChannelID string
}

// notify sends a push to every device the person has registered, web and
// Android. It never blocks the caller.
func (s *NexusServer) notify(recipient string, n pushNote) {
	if recipient == "" {
		return
	}
	n.Body = pushPreview(n.Body)
	if h := loadNotifyHook(); h != nil {
		h(recipient, n)
	}
	go s.sendWebNote(recipient, n)
	go s.sendFCMNote(recipient, n)
}

// pushPreview keeps encrypted bodies and file links out of notifications.
func pushPreview(body string) string {
	if strings.HasPrefix(body, "E2EE:") || strings.HasPrefix(body, "phaze-file:") {
		return "New encrypted message"
	}
	if r := []rune(body); len(r) > 100 {
		return string(r[:100]) + "…"
	}
	return body
}

var mentionWordRe = regexp.MustCompile(`@([A-Za-z0-9._-]{3,32})`)

// mentions reports whether body @-mentions username (case-insensitive).
func mentions(body, username string) bool {
	if username == "" {
		return false
	}
	for _, m := range mentionWordRe.FindAllStringSubmatch(body, -1) {
		// A sentence can end right after a name: "thanks @bob."
		if strings.EqualFold(strings.TrimRight(m[1], "."), username) {
			return true
		}
	}
	return false
}

// channelPushFor decides whether a channel message is worth a push to one
// member, and of which kind. Only real messages count: reactions, edits,
// deletes, pins and whiteboard strokes never push. In the Phaze-wide Hub,
// which everyone belongs to, only an @-mention pushes.
func channelPushFor(serverID string, payload NexusMessage, member string) (kind string, ok bool) {
	if payload.Type != "channel_msg_in" || member == payload.Sender {
		return "", false
	}
	if mentions(payload.Body, member) {
		return pushKindMention, true
	}
	if serverID == globalSpaceID {
		return "", false
	}
	return pushKindChannel, true
}

func (s *NexusServer) registerFCMToken(username, token string) error {
	token = strings.TrimSpace(token)
	if username == "" || token == "" || len(token) > 4096 {
		return nil
	}
	// A token belongs to one install. If that install signs in as someone
	// else, the token moves with it so the old account stops getting pushes.
	if _, err := s.DB.Exec(`INSERT INTO fcm_tokens (token, username, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(token) DO UPDATE SET username = excluded.username, updated_at = CURRENT_TIMESTAMP`,
		token, username); err != nil {
		return err
	}
	_, err := s.DB.Exec(`DELETE FROM fcm_tokens WHERE username = ? AND token NOT IN (
		SELECT token FROM fcm_tokens WHERE username = ? ORDER BY updated_at DESC, rowid DESC LIMIT ?)`,
		username, username, maxFCMTokensPerUser)
	return err
}

func (s *NexusServer) fcmTokensFor(username string) []string {
	rows, err := s.DB.Query(`SELECT token FROM fcm_tokens WHERE username = ?`, username)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var t string
		if rows.Scan(&t) == nil && t != "" {
			out = append(out, t)
		}
	}
	return out
}

// fcmMessage builds a data-only message. The app's own service always
// builds the notification, so a tap opens the right chat whether the app
// was in the foreground or not. Older app versions read title and body
// from the data too.
func fcmMessage(token string, n pushNote) *messaging.Message {
	ttl := 24 * time.Hour
	data := map[string]string{
		"title": n.Title,
		"body":  n.Body,
		"kind":  n.Kind,
	}
	for k, v := range map[string]string{
		"sender":     n.Sender,
		"convo_id":   n.ConvoID,
		"server_id":  n.ServerID,
		"channel_id": n.ChannelID,
	} {
		if v != "" {
			data[k] = v
		}
	}
	return &messaging.Message{
		Token: token,
		Data:  data,
		Android: &messaging.AndroidConfig{
			Priority: "high",
			TTL:      &ttl,
		},
	}
}

func (s *NexusServer) sendFCMNote(recipient string, n pushNote) {
	if s.fcmClient == nil {
		return
	}
	for _, token := range s.fcmTokensFor(recipient) {
		_, err := s.fcmClient.Send(context.Background(), fcmMessage(token, n))
		if err == nil {
			continue
		}
		log.Printf("[FCM] send to %s: %v", recipient, err)
		if messaging.IsUnregistered(err) {
			s.DB.Exec(`DELETE FROM fcm_tokens WHERE token = ?`, token)
		}
	}
}

func webPushPayload(n pushNote) []byte {
	out := map[string]string{"title": n.Title, "body": n.Body, "kind": n.Kind}
	if n.Sender != "" {
		out["sender"] = n.Sender
	}
	if n.ConvoID != "" {
		out["convo_id"] = n.ConvoID
	}
	if n.ServerID != "" {
		out["server_id"] = n.ServerID
	}
	if n.ChannelID != "" {
		out["channel_id"] = n.ChannelID
	}
	b, _ := json.Marshal(out)
	return b
}

func (s *NexusServer) sendWebNote(recipient string, n pushNote) {
	privKey := os.Getenv("VAPID_PRIVATE_KEY")
	pubKey := os.Getenv("VAPID_PUBLIC_KEY")
	if privKey == "" || pubKey == "" {
		return
	}
	rows, err := s.DB.Query("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE username = ?", recipient)
	if err != nil {
		return
	}
	type sub struct{ endpoint, p256dh, auth string }
	var subs []sub
	for rows.Next() {
		var x sub
		if rows.Scan(&x.endpoint, &x.p256dh, &x.auth) == nil {
			subs = append(subs, x)
		}
	}
	rows.Close()
	payload := webPushPayload(n)
	for _, x := range subs {
		resp, err := webpush.SendNotification(payload, &webpush.Subscription{
			Endpoint: x.endpoint,
			Keys:     webpush.Keys{P256dh: x.p256dh, Auth: x.auth},
		}, &webpush.Options{
			VAPIDPublicKey:  pubKey,
			VAPIDPrivateKey: privKey,
			Subscriber:      "noreply@phazechat.world",
			TTL:             86400,
		})
		if err != nil {
			log.Printf("[push] send to %s: %v", recipient, err)
			continue
		}
		// The browser dropped this subscription; stop sending to it.
		if resp.StatusCode == 404 || resp.StatusCode == 410 {
			s.DB.Exec(`DELETE FROM push_subscriptions WHERE endpoint = ?`, x.endpoint)
		}
		resp.Body.Close()
	}
}

// notifyHook lets tests see each push without Firebase or VAPID keys.
var notifyHook atomic.Pointer[func(string, pushNote)]

func loadNotifyHook() func(string, pushNote) {
	if p := notifyHook.Load(); p != nil {
		return *p
	}
	return nil
}
