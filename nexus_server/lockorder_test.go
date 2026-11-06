package main

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// hammerWriters keeps taking s.Mu for writing, the way logins and logouts do,
// until stop is closed.
func hammerWriters(s *NexusServer, stop <-chan struct{}, wg *sync.WaitGroup) {
	defer wg.Done()
	for {
		select {
		case <-stop:
			return
		default:
		}
		s.Mu.Lock()
		s.Mu.Unlock()
	}
}

// runAgainstWriters runs fn n times while writers hammer s.Mu and fails if it
// doesn't finish in time. A function that takes s.Mu.RLock while already
// holding it deadlocks here: the writer queues between the two read locks
// and neither side can move.
func runAgainstWriters(t *testing.T, s *NexusServer, n int, fn func()) {
	t.Helper()
	stop := make(chan struct{})
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go hammerWriters(s, stop, &wg)
	}
	var done atomic.Int64
	finished := make(chan struct{})
	go func() {
		for i := 0; i < n; i++ {
			fn()
			done.Add(1)
		}
		close(finished)
	}()
	select {
	case <-finished:
		close(stop)
		wg.Wait()
	case <-time.After(20 * time.Second):
		t.Fatalf("stuck after %d of %d calls: something takes s.Mu.RLock twice", done.Load(), n)
	}
}

func TestBroadcastProfileUpdate_DoesNotRelockRegistry(t *testing.T) {
	s := &NexusServer{Clients: map[string][]*Client{}}
	runAgainstWriters(t, s, 20000, func() {
		s.broadcastProfileUpdate("alice", "Alice", "hi")
	})
}

func TestFanoutConvoMsg_DoesNotRelockRegistry(t *testing.T) {
	s, _, _ := newTestServer(t)
	s.DB.Exec(`INSERT INTO conversations (id, name, created_by) VALUES ('c1', 'Crew', 'alice')`)
	members := []string{"alice", "bob", "carol"}
	runAgainstWriters(t, s, 300, func() {
		s.fanoutConvoMsg("c1", "alice", "hello", nil, members)
	})
	var n int
	s.DB.QueryRow(`SELECT COUNT(*) FROM offline_messages WHERE convo = 'c1'`).Scan(&n)
	if n != 600 {
		t.Fatalf("offline queue got %d rows, want 600 (300 messages x 2 offline members)", n)
	}
}
