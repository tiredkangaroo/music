package library

import (
	"log/slog"
	"sync"
)

type noDuplicate[T any] struct {
	keys map[string]chan T // keys of functions in the queue, we could theoretically have remove functions pass in values so waiters can get return values
	rwmx sync.RWMutex      // rw mutex to protect keys
}

// Add adds a key to the no duplicate set. it returns true if the key was added,
// false if the key already exists.
func (nd *noDuplicate[T]) Add(key string) bool {
	nd.rwmx.Lock()
	defer nd.rwmx.Unlock()
	if _, exists := nd.keys[key]; exists {
		return false
	}
	nd.keys[key] = make(chan T)
	return true
}

// Remove removes a key from the no duplicate set. should be called after the function
// associated with the key is done executing.
func (nd *noDuplicate[T]) Remove(key string, value T) {
	nd.rwmx.Lock()
	defer nd.rwmx.Unlock()
	if ch, exists := nd.keys[key]; exists {
		// send value to waiters before closing the channel (there may be no waiters)
		select {
		case ch <- value:
			close(ch)
		default:
			close(ch)
			slog.Warn("no waiters for key in noDuplicate, value will be lost", "key", key, "value", value)
		}
	} else {
		slog.Warn("you've got a real bad problem rn icl", "key", key)
	}
	delete(nd.keys, key)
}

// Wait waits for the function associated with the key to finish executing.
func (nd *noDuplicate[T]) Wait(key string) T {
	nd.rwmx.RLock()
	ch, exists := nd.keys[key]
	nd.rwmx.RUnlock()
	if !exists {
		var zero T
		return zero
	}
	return <-ch
}

func newNoDuplicate[T any]() *noDuplicate[T] {
	return &noDuplicate[T]{
		keys: make(map[string]chan T),
	}
}

// slots limits the number of concurrent operations. it has a fixed number of slots,
// and each operation must acquire a slot before it can proceed. when an operation
// is done, it releases its slot back to the pool.
type slots struct {
	sem chan struct{}
}

func (s *slots) Acquire() {
	s.sem <- struct{}{}
}

func (s *slots) Release() {
	<-s.sem
}

func newSlots(max int) *slots {
	return &slots{
		sem: make(chan struct{}, max),
	}
}
