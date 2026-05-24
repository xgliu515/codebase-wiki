# Versioning: the version layer

Inside the mono-repo, each project directory holds one or more **versions**
of that project's wiki: `<project>/<version>/`. This doc covers the version
layer — directory naming, the `versions.json` manifest, the version
selector page, and the in-viewer version dropdown. For the project layer
and the overall repo, see `reference/monorepo.md`.

## Where the version layer sits

```
<mono-repo>/<project>/
├── index.html        version selector (from templates/version-index.html)
├── versions.json     this project's version manifest
├── v0.22.0/          one complete, self-contained wiki
│   ├── index.html  *.md  web/
└── v0.21.1/
```

Each `v<x>/` is a complete wiki that runs on its own. Versions share no
files. Once generated, a version is frozen.

## versions.json

`<project>/versions.json` drives the project's version selector page and
the in-viewer version dropdown.

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

The array is newest-first. Appending a version pushes a new entry to the
head and flips the previous `latest` to `false`.

## Version directory naming

After locking the target version:

1. `git describe --tags --exact-match HEAD` succeeds → use that tag, e.g. `v0.22.0/`.
2. Otherwise → `<branch>-<shortSHA>`, e.g. `main-a1b2c3d/`. Branch from `git rev-parse --abbrev-ref HEAD`.
3. Replace `/` and other path-illegal characters with `-`.
4. If the derived directory already exists, STOP and ask the user: overwrite, or pick a different name. Never silently overwrite.

## Version selector page

`<project>/index.html` (from `templates/version-index.html`) fetches the
sibling `versions.json` and lists versions as cards. It links back to the
project selector via `../index.html` and loads `../selector.css`.

## In-viewer version dropdown

`web/js/versions.js` exports `initVersionSwitcher()`, which fetches
`../versions.json`, renders the topbar version dropdown, and on change
navigates to `../<dir>/index.html`. On fetch failure the dropdown hides
itself. (`versions.js` also exports `initProjectSwitcher()` — see
`reference/monorepo.md`.)

`STORAGE_PREFIX` in `chapters.js` includes `PROJECT_NAME` and the version
directory name, so multiple versions on the same origin do not collide in
localStorage.

## Converting an old flat-layout wiki to versioned

Pre-versioning wikis have a flat layout (no `versions.json`). The import
flow (`reference/monorepo.md`) converts them. The flat→versioned
conversion for one wiki:

1. Read the old `web/js/chapters.js` for `ANALYZED_TAG`, `ANALYZED_COMMIT`,
   `ANALYZED_DATE`. Derive the version directory name (prefer `ANALYZED_TAG`,
   else `ANALYZED_COMMIT`).
2. Move the flat wiki's `index.html`, all `.md`, and `web/` into `v<x>/`.
3. Patch `v<x>/web/js/chapters.js`: replace its old `STORAGE_PREFIX` block
   with the version-aware block — `getCurrentVersionDir()`,
   `getCurrentProjectDir()`, and the new `STORAGE_PREFIX` (identical to the
   current `templates/web/js/chapters.js`). REQUIRED: the injected
   `versions.js` imports those functions, or the viewer breaks on startup.
4. Inject the version dropdown and project dropdown into `v<x>/`: copy in
   `web/js/versions.js`, add `<select id="version-switcher">` and
   `<select id="project-switcher">` to the `index.html` topbar, add the
   imports + `initVersionSwitcher()` / `initProjectSwitcher()` calls to
   `web/js/app.js`. Nav chrome only — never the chapter `.md` content.
5. Create the project's `index.html` (version selector) + `versions.json`
   (single entry).

## Error handling

- Version dir collision → ask overwrite / rename; never silent overwrite.
- `versions.json` corrupt or invalid → report and ask the user.
- Viewer offline (no `versions.json` reachable) → the version dropdown hides itself.

## Cross-language versions

Different versions of the same project may technically use different languages (e.g. v1 in `zh-CN`, v2 in `en`), since each version is self-contained. This is **not recommended** in practice — the version switcher in the topbar will jump between languages, which is jarring. If you migrate a project from Chinese to English, treat it as a fresh project under a new directory rather than a new version of the existing one.
