# Step 2: Counter update under lock

Handler:

1. Acquires the mutex
2. Reads `counter.value`
3. Increments
4. Writes back
5. Releases mutex
6. Returns JSON

This ensures linearizable increment semantics.
