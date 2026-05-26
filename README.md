# codebase-wiki

A Claude Code skill for generating **problem-first interactive learning wikis** for any software codebase, plus a self-hostable **service** that loads them.

Two halves, one repo:

1. **The skill** (`SKILL.md` + `templates/` + `reference/`) — Claude reads this to generate a `.wikipkg.tar.gz` package containing 10-15 reference chapters + a single-request narrative trace tour + glossary + per-chapter MCQ quizzes + SVG figures.
2. **The service** (`server/` + `viewer/` + `shared/` + `tools/wikipkg/`) — Node + Hono + SQLite + TS viewer. Admin uploads a wikipkg; users browse, take quizzes, track progress, post Q&A. Self-hostable, GitHub OAuth.

The methodology was developed and battle-tested while building wikis for vLLM and other projects.

> **Looking for the old self-contained static-site flow** (HTML+JS wiki for GitHub Pages, no service required)?
> It lives on the **`legacy-static-site` branch** (last tag: `v1-last`). That branch is in maintenance mode (bug fixes only).
> ```bash
> git clone -b legacy-static-site https://github.com/xgliu515/codebase-wiki.git ~/.claude/skills/codebase-wiki
> ```

---

## Install the skill (Claude Code)

```bash
# Clone the new (service + wikipkg) flow
git clone https://github.com/xgliu515/codebase-wiki.git ~/.claude/skills/codebase-wiki
```

Restart Claude Code or open a new session. Then in any conversation:

```
I want to generate a wikipkg for the codebase at /path/to/project. Use the codebase-wiki skill.
```

Or invoke explicitly via slash command:

```
/codebase-wiki
```

Claude reads `SKILL.md` and walks you through 7 phases (inputs → explore → trace tour → generate content → SVG → glossary → quizzes → pack).

The final artifact is a single `.wikipkg.tar.gz` that you upload to your service instance.

## Run the service

```bash
git clone https://github.com/xgliu515/codebase-wiki.git
cd codebase-wiki
npm install && npm run build

DATA_DIR=/var/lib/cwiki \
  GITHUB_CLIENT_ID=<oauth-app-id> \
  GITHUB_CLIENT_SECRET=<oauth-app-secret> \
  OAUTH_REDIRECT_URI=https://your-host/api/v1/auth/github/callback \
  ADMIN_GITHUB_LOGINS=your_github_login \
  PUBLIC_READ=true \
  COOKIE_SECURE=true \
  node server/dist/server.js
```

Visit `http://localhost:3000` (or your host). Sign in with GitHub. As admin, drop a `.wikipkg.tar.gz` into `/admin/upload`. Other users browse + learn + quiz.

For full design context see `docs/specs/2026-05-25-codebase-wiki-service-design.md`.

## What's in the wikipkg

```
manifest.json                  # data contract; schema in reference/wikipkg-format.md
chapters/<slug>.md             # 10-15 reference chapters
tours/<tour-slug>/00-overview.md
tours/<tour-slug>/01-<step>.md ... NN-<step>.md
quizzes/<chapter-slug>.json    # 3-8 MCQ per chapter
figures/<slug>.svg
glossary.json
```

The service's TS viewer renders all of this, plus tracks per-user progress, grades MCQ answers, and accepts addenda (Q&A) per chapter.

## Methodology in one sentence

**Lead with the problem and the failure of the naive solution; the actual design then reads like an obvious consequence rather than a stated conclusion.**

See `reference/8-section-template.md` for the exact tour-step template. See `reference/chapter-planning.md` for how to slice a codebase into chapters.

## Status

- `main` (v2.x) — wikipkg + service. Active development.
- `legacy-static-site` (v1.x) — old static-site mode. Maintenance only.

## License

MIT. Generated wikis are owned by you and licensed however you choose.
