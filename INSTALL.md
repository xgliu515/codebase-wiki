# Install

## Claude Code (CLI)

```bash
git clone https://github.com/xgliu515/codebase-wiki.git ~/.claude/skills/codebase-wiki
```

Open a new session. The skill is now discoverable.

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
I want to generate a learning wiki for the codebase at /path/to/project. Use the codebase-wiki skill.
```

Claude will read `SKILL.md` and walk you through 7 phases (gather inputs → explore → trace design → generate → web setup → SVG → publish).

## Update

```bash
cd ~/.claude/skills/codebase-wiki && git pull
```

## Uninstall

```bash
rm -rf ~/.claude/skills/codebase-wiki
```
