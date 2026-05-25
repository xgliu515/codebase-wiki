# Step 1: HTTP entry

Express's router matches `POST /increment` and dispatches to the handler.

**Naive design:** call counter update directly. **Fails** if two requests arrive concurrently — last-write-wins race. **Actual design** (next step) inserts a mutex.
