# Request Flow

When a client POSTs `/increment`:

1. Express route matches `POST /increment`
2. Handler acquires the mutex
3. Handler reads `counter.value`, increments, writes back
4. Releases mutex
5. Returns `{ value: <new> }` as JSON

The mutex is held only across the read-modify-write, not during JSON serialization.
