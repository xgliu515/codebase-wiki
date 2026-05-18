# Versioning: multi-version wiki layout

A wiki repo holds one or more versions of the target codebase, each as a
self-contained subdirectory. This doc defines the layout, the version
directory naming rule, the three run modes, and the migration path for
old flat-layout wikis.

## Repo layout

```
xxx-wiki/                       (git repo, GitHub Pages serves from main /)
├── index.html                  top-level version selector (from templates/version-index.html)
├── selector.css                selector page styles (from templates/selector.css)
├── versions.json               version manifest — the single source of truth
├── README.md  LICENSE  .gitignore
├── v0.22.0/                    one complete, self-contained wiki
│   ├── index.html              per-version viewer entry (from templates/index.html)
│   ├── 01-...md ... 12-glossary-and-faq.md
│   ├── tour-00-overview.md ... tour-NN-*.md
│   └── web/  (css/  js/)
├── v0.21.1/                    previous version, same structure, fully independent
└── main-a1b2c3d/               no-tag example
```

Each `v<x>/` is a complete wiki that runs on its own. Versions share no
files. Once generated, a version is frozen — later skill upgrades never
touch it (the one exception: migration injects the version dropdown into
a migrated old version, see below).

## versions.json

The top-level `versions.json` drives both the selector page and the
in-viewer dropdown. Schema:

```json
{
  "project": "vLLM",
  "versions": [
    { "dir": "v0.22.0", "label": "v0.22.0", "commit": "abc1234",
      "target_ref": "v0.22.0", "date": "2026-05-18", "latest": true },
    { "dir": "v0.21.1", "label": "v0.21.1", "commit": "0867497",
      "target_ref": "v0.21.1", "date": "2026-04-01", "latest": false }
  ]
}
```

- `dir` — version subdirectory name, also the routing id.
- `label` — text shown in the dropdown and on the selector card. Defaults to `dir`.
- `commit` — short SHA of the analyzed target commit.
- `target_ref` — the target tag or branch name.
- `date` — generation date (ISO).
- `latest` — exactly one entry is `true`.

The array is newest-first. Adding a version means pushing a new entry to
the head and flipping the previous `latest` to `false`.

## Version directory naming

After locking the target version (Phase 0), derive the directory name:

1. If `git describe --tags --exact-match HEAD` succeeds → use that tag, e.g. `v0.22.0/`.
2. Otherwise → `<branch>-<shortSHA>`, e.g. `main-a1b2c3d/`. Branch is `git rev-parse --abbrev-ref HEAD`.
3. Replace any `/` and other path-illegal characters with `-`.
4. If the derived directory already exists, STOP and ask the user: overwrite it, or pick a different name. Never silently overwrite.

## Three run modes

When the skill runs, probe the output directory:

| Detected | Mode | Action |
|----------|------|--------|
| Directory missing / empty, no `versions.json` | fresh | Build a new v2-layout repo |
| `versions.json` present | append | Add one `v<x>/` |
| Root-level `index.html` + `web/js/chapters.js`, no `versions.json` | migrate | Migrate the old wiki, then append |

### Fresh mode

`git init -b main` → write top-level `index.html`, `selector.css`,
`README.md`, `LICENSE`, `.gitignore` → build the first `v<x>/` → write
`versions.json` (single entry, `latest: true`) → commit → enable Pages.

### Append mode

Repo already exists → add a new `v<x>/` → push a new entry to the head of
`versions.json` and flip the prior `latest` to `false` → top-level
`index.html` / `selector.css` are NOT touched → commit and push.

### Migrate mode

The old flat-layout wiki has no `versions.json`. Migration must be
confirmed by the user before running (it `git mv`s many files):

1. Read the old `web/js/chapters.js` for `ANALYZED_TAG`, `ANALYZED_COMMIT`,
   `ANALYZED_DATE`, `PROJECT_NAME`, `PROJECT_GITHUB_REPO`. Derive the
   directory name via the naming rule (prefer `ANALYZED_TAG`, else `ANALYZED_COMMIT`).
2. `git mv` the root-level old wiki — `index.html`, all `.md`, `web/` —
   into `v<derived>/`. Keep `README.md`, `LICENSE`, `.gitignore`, `.git/`
   at the root. `git mv` preserves history.
3. Inject the version dropdown into the migrated version's viewer:
   - Copy the new `web/js/versions.js` into `v<derived>/web/js/`.
   - Add the `<select id="version-switcher" class="version-switcher" title="切换版本" hidden></select>`
     element to that directory's `index.html` topbar, right after the `.brand` div.
   - Add `import { initVersionSwitcher } from './versions.js';` to that
     directory's `web/js/app.js` and a `initVersionSwitcher();` call in `main()`.
   - Add the `.version-switcher` CSS rule to that directory's `web/css/style.css`.
   - Touch only navigation chrome — never the chapter `.md` content.
4. Write the top-level `index.html` (selector), `selector.css`, and
   `versions.json` (single entry = the migrated version).
5. Continue in append mode to add the new version (the new version
   becomes `latest`; the migrated version flips to `false`).

## Error handling

- Derived directory already exists → ask overwrite / rename; never silent overwrite.
- `versions.json` corrupt or invalid → report and ask the user; never silently rebuild.
- Migration → require user confirmation before `git mv`.
- Viewer offline (no `versions.json` reachable) → the dropdown hides itself; the rest of the viewer is unaffected.
- Branch name contains a slash (e.g. `feature/x`) → replace with `-` before appending the short SHA.
