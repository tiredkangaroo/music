package library

import (
	"sync"
)

type noDuplicate struct {
	keys map[string]chan struct{} // keys of functions in the queue
	rwmx sync.RWMutex             // rw mutex to protect keys
}

// Add adds a key to the no duplicate set. it returns true if the key was added,
// false if the key already exists.
func (nd *noDuplicate) Add(key string) bool {
	nd.rwmx.Lock()
	defer nd.rwmx.Unlock()
	if _, exists := nd.keys[key]; exists {
		return false
	}
	nd.keys[key] = make(chan struct{})
	return true
}

// Remove removes a key from the no duplicate set. should be called after the function
// associated with the key is done executing.
func (nd *noDuplicate) Remove(key string) {
	nd.rwmx.Lock()
	defer nd.rwmx.Unlock()
	close(nd.keys[key])
	delete(nd.keys, key)
}

// Wait waits for the function associated with the key to finish executing.
func (nd *noDuplicate) Wait(key string) {
	nd.rwmx.RLock()
	ch, exists := nd.keys[key]
	nd.rwmx.RUnlock()
	if !exists {
		return
	}
	<-ch
}

func newNoDuplicate() *noDuplicate {
	return &noDuplicate{
		keys: make(map[string]chan struct{}),
	}
}
