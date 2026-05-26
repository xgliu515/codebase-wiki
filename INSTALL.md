# Install

## Claude Code (CLI)

### New flow (wikipkg + service, recommended)

```bash
git clone https://github.com/xgliu515/codebase-wiki.git ~/.claude/skills/codebase-wiki
```

Open a new session. The skill is now discoverable.

### Legacy flow (static-site, for GitHub Pages)

If you want the old self-contained static-site output (no service required), use the `legacy-static-site` branch:

```bash
git clone -b legacy-static-site https://github.com/xgliu515/codebase-wiki.git ~/.claude/skills/codebase-wiki
```

This branch is in maintenance-only mode (bug fixes welcome, no new features).

## Verify

In a new conversation, type:

```
list available skills
```

You should see `codebase-wiki` in the list.

## Use

Either invoke explicitly:

```
/codebase-wiki
```

Or describe what you want:

```
I want to generate a wikipkg for the codebase at /path/to/project. Use the codebase-wiki skill.
```

Claude reads `SKILL.md` and walks you through 7 phases (inputs → explore → trace tour → generate → SVG → glossary → quizzes → pack). The final artifact is a single `.wikipkg.tar.gz` you upload to your `codebase-wiki` service.

For the legacy branch, the flow is different — see that branch's own `SKILL.md`.

## Update

```bash
cd ~/.claude/skills/codebase-wiki && git pull
```

(If you switched to `legacy-static-site`, `git pull` updates that branch.)

## Switch between flows

```bash
# legacy → new
cd ~/.claude/skills/codebase-wiki && git checkout main && git pull

# new → legacy
cd ~/.claude/skills/codebase-wiki && git checkout legacy-static-site && git pull
```

Restart Claude Code or open a new session after switching.

## Uninstall

```bash
rm -rf ~/.claude/skills/codebase-wiki
```

## Run the service (separately, for the new flow)

The wikipkg is consumed by a self-hostable service. See `README.md` "Run the service" for the env vars + boot command. Typically you'd deploy the service on a host (or docker container) and your team uploads wikipkgs as you generate them.
