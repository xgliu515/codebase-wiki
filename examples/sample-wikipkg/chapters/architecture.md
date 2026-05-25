# Architecture

Three layers:

1. HTTP server (Express)
2. Counter store (in-memory `{ value: number }`)
3. Locking layer (single `Mutex`)

![architecture diagram](figures/architecture.svg)

The locking layer ensures concurrent increment requests do not race.
