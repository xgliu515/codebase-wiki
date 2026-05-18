# Mono-repo: many projects in one wiki repo

The skill writes every wiki into a single **mono-repo** with a three-level
tree: `mono-repo / <project> / <version> / wiki`. This doc defines the
layout, the manifests, the run modes, and the import flow for existing
standalone wiki repos. For the version layer in isolation see
`reference/versioning.md`.

## Repo layout

```
wikis/                          (mono-repo, GitHub Pages serves from main /)
├── index.html                  project selector (from templates/project-index.html)
├── selector.css                shared selector styling (project + version pages)
├── projects.json               project manifest — the top-level source of truth
├── README.md  LICENSE  .gitignore
├── vllm/
│   ├── index.html              version selector (from templates/version-index.html)
│   ├── versions.json           this project's version manifest
│   ├── v0.22.0/                one complete, self-contained wiki
│   │   ├── index.html  *.md  web/
│   └── v0.21.1/
└── react/
    ├── index.html
    ├── versions.json
    └── v18.2.0/
```

Each `<project>/<version>/` is a complete, self-contained wiki. The
version layer works exactly as `reference/versioning.md` describes — it
just lives one level under a project directory. Relative paths make the
nesting work with no code change: the in-viewer version dropdown fetches
`../versions.json`, the project dropdown fetches `../../projects.json`.

`selector.css` lives once at the repo root. The project selector
references `selector.css`; each version selector references `../selector.css`.

## projects.json

The repo-root `projects.json` is the top-level source of truth, driving
the project selector page and the in-viewer project dropdown.

```json
{
  "title": "Codebase Wikis",
  "projects": [
    { "dir": "vllm", "name": "vLLM", "github": "vllm-project/vllm",
      "tagline": "为深入学习 vLLM 源码而写", "versions": 2,
      "latest": "v0.22.0", "updated": "2026-05-18" },
    { "dir": "react", "name": "React", "github": "facebook/react",
      "tagline": "...", "versions": 1, "latest": "v18.2.0", "updated": "2026-04-01" }
  ]
}
```

- `dir` — project subdirectory name, also the routing id. `slug(name)`.
- `name` — friendly project name (selector card + viewer dropdown).
- `github` — target code's GitHub repo (`owner/repo`), display only.
- `tagline` — one-line description on the project card.
- `versions` — current version count for this project.
- `latest` — directory name of this project's latest version.
- `updated` — date of this project's most recent generation / append (ISO).

The array is newest-first by `updated`. Adding a project pushes a new
entry to the head; appending a version updates that project's entry
(`versions` / `latest` / `updated`) and moves it to the head.

## Project directory naming

`dir = slug(name)`: lowercase, non-alphanumeric runs → `-`, trim leading
and trailing `-`. If a "new project" run derives a `dir` that already
exists, STOP and ask the user: rename, or treat the run as "append
version". Never silently merge.

Version directory naming is unchanged — see `reference/versioning.md`.

## Run modes

When the skill runs, probe the output directory:

| Detected | Mode | Action |
|----------|------|--------|
| No `projects.json`, directory empty / missing | new mono-repo | Create the repo + its first project |
| `projects.json` present, target project dir absent | new project | Add a project to the mono-repo |
| `projects.json` present, target project dir present | append version | Add a version to that project |

### New mono-repo

`git init -b main` → write repo-root `index.html` (project selector),
`selector.css`, `README.md`, `LICENSE`, `.gitignore` → build the first
`<project>/` (version selector + `versions.json` + first `v<x>/`) → write
`projects.json` (single entry) → commit → enable Pages.

### New project

Repo already exists → build a new `<project>/` (version selector +
`versions.json` + first `v<x>/`) → push a new entry to the head of
`projects.json` → repo-root `index.html` / `selector.css` are NOT touched
→ commit and push.

### Append version

Add `<project>/v<x>/` → update `<project>/versions.json` (push to head,
flip `latest`) → update that project's entry in `projects.json`
(`versions` / `latest` / `updated`, move to head) → repo-root files and
other projects are NOT touched → commit and push.

## Import flow

The import flow brings already-generated standalone wiki repos into the
mono-repo. It is a separate entry point and can batch multiple sources.
Before moving or copying many files, tell the user and get confirmation.

For each source wiki repo:

1. Detect the source layout — `versions.json` at the source root → already
   versioned; only root-level `index.html` + `web/js/chapters.js` → flat.
2. Read the project identity from the source's `web/js/chapters.js`
   (`PROJECT_NAME`, `PROJECT_GITHUB_REPO`); for a versioned source use the
   latest version's `chapters.js`. Project dir = `slug(PROJECT_NAME)`.
3. Flat source — run the flat→versioned conversion (version dir from
   `ANALYZED_TAG`, else `ANALYZED_COMMIT`; see `reference/versioning.md`),
   landing the output at `<mono>/<project>/v<x>/`, and create
   `<mono>/<project>/index.html` (version selector) + `<mono>/<project>/versions.json`.
4. Versioned source — copy the source contents (except `README.md` /
   `LICENSE` / `.gitignore` / `.git/`) into `<mono>/<project>/`. Delete the
   leftover `<project>/selector.css` and confirm the version selector
   references `../selector.css`.
5. Inject the project dropdown into every version of the imported project:
   ship the current `web/js/versions.js` (with `initProjectSwitcher`), add
   `<select id="project-switcher" class="version-switcher" title="切换项目" hidden></select>`
   to each `index.html` topbar, and add the import + `initProjectSwitcher()`
   call to each `app.js`. Nav chrome only — never chapter `.md` content.
6. Register the project in repo-root `projects.json`; ensure repo-root
   `index.html` (project selector) + `selector.css` exist.
7. The source repo is NOT deleted — import copies.

## Error handling

- Project dir collision on a "new project" run → ask rename / append; never silently merge.
- `projects.json` corrupt or invalid → report and ask the user; never silently rebuild.
- Import moving many files → require user confirmation first.
- Selector page or viewer fails to fetch its manifest → that dropdown / list silently degrades; the rest is unaffected.
- Leftover `<project>/selector.css` from a versioned source → delete on import; the version selector uses `../selector.css`.
- Imported source repos are always kept, never deleted.
