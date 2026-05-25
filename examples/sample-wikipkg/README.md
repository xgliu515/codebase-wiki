# tiny-counter sample wikipkg

A minimal but realistic wikipkg fixture used for testing the codebase-wiki **service** (Plan B).
3 chapters, 1 tour with 2 steps, 1 figure, glossary with 2 terms, quizzes for every chapter.

## Usage in Plan B tests

```bash
node tools/wikipkg/dist/cli.js pack examples/sample-wikipkg /tmp/tiny-counter-v0.1.0.wikipkg.tar.gz
```

Upload the resulting tarball via `POST /api/v1/admin/wikis` (Plan B Task X).
