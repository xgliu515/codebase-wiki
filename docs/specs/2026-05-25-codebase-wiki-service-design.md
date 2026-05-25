# codebase-wiki 服务化设计(service + data 拆分)

**Status**: spec
**Date**: 2026-05-25
**Scope**: 把 codebase-wiki 从「静态生成器 + 嵌入式 viewer」改造为「可自部署服务 + 版本化数据包」。服务提供加载、鉴权、阶段性测验、用户进度、addenda 等能力;wiki 生成器产物变为单一 tarball,上传即用。数据格式从一开始就为多内容类型(代码 / 文章 / 故事 / ...)预留扩展位,但 v1 只实现 `content_type=codebase`。

## Background

现状(2026-05-25):

- skill 产物是一个**自包含的静态站点**:markdown + vanilla ES modules viewer + 配套 CSS,部署到 GitHub Pages 即可
- 每份 wiki 内嵌一份 viewer 拷贝(`templates/web/js/`),viewer 通过约定的文件名 + `chapters.js` 元信息自取内容
- 用户态(已读章节、收藏、addenda 草稿)只活在浏览器 localStorage,不可跨设备
- 无账号、无测验、无进度感知;addenda 通过 Q&A 流程沉淀到 git,但属于「生成器侧」资产

新需求催生本设计:

1. 让 wiki **服务化** —— 用户登录后,服务跟踪每个人的学习进度
2. 加入**阶段性测验**(章节级 MCQ),让用户获得成就感、自我校验
3. wiki 产物降为「纯数据」:一份带版本号的 tarball,上传即可被服务消费;**服务端能持续加功能,wiki 包格式不被绑架**
4. 数据契约**版本化**,服务能识别并拒绝不兼容的包
5. 解耦做强一些 —— 未来基于「文章 / 故事 / 论文」生成 wiki 时,**数据格式不必重写**

## Non-Goals

v1 明确不做:

- **不迁移老 wikis**:vllm-wiki 等现有静态站继续运行,新格式只服务新生成
- **不做公开 SaaS**:仅自部署形态(docker / 单进程),内部/团队使用
- **不实现 email/password 认证**:只 GitHub OAuth
- **不实现 tour 级 / 里程碑 / 主动「考我」**:测验触发仅「读完一章后」
- **不接入运行时 LLM**(短答题 / 自动评分):quiz 在生成阶段离线产出,运行时 MCQ 服务端判分
- **不支持多实例横向扩展**:单进程 + SQLite WAL,撞墙再迁
- **不做 PWA / 离线 / WebSocket / 移动端专属布局**
- **不引入前端框架**(React/Vue/Svelte):坚持 vanilla TS + 单文件 bundle

## Architecture

### 三层职责切分

```
codebase-wiki skill (生成器)
  ↓ 产物: <subject-slug>-<version>.wikipkg.tar.gz
wiki-server (Node + TS + Hono + better-sqlite3)
  ↓ HTTP: HTML shell + /api/v1/*
viewer (vanilla TS, 服务静态托管)
```

- **生成器 ↔ 服务**:只通过 `.wikipkg.tar.gz` 这一个产物。tarball 是不可变事实;服务**只读**它
- **服务 ↔ 浏览器**:服务负责所有需要鉴权 / 需要状态的事(用户、进度、答题、addenda 写入);浏览器负责无状态渲染(markdown / glossary / search UI)
- **数据可变性**:wiki 内容是 immutable;用户产生的数据(进度、答题、addenda)mutable,只存 SQLite

### 解耦原则(贯穿全设计)

将「内容」「呈现」「功能」切到三层,**新功能默认加在服务层,不进 package**:

| 层 | 职责 | 何时变更 |
|---|---|---|
| **wiki package** | 只装结构化内容(章节、tour、题目、glossary、figures、元信息) | 仅当数据**形状**本身变化 |
| **viewer** | 渲染 + 交互。**只通过 manifest 读包**,不假设任何文件位置 | 当呈现/交互需求变化 |
| **service** | 鉴权、状态、增量功能(进度/答题/addenda/未来的笔记/讨论/...) | 新功能默认加在这里 |

落到硬约束上:

1. **package 不含任何呈现选择**:不写 CSS、不指定布局、不嵌 HTML。SVG 允许但禁止 inline `<style>`,主题靠 viewer 注入
2. **viewer 读包只经过 manifest**:文件名/路径不能 hard-code,所有资源由 `manifest.json` 声明
3. **新功能默认走「service + viewer」**:加用户笔记 / 评论 / 自动答疑 / LLM 助手 —— **wiki 包零改动**
4. **package schema 演进:additive-only,主版本号才允许破坏**
5. **viewer 必须 graceful degrade**:老包没 quizzes 就不显示「开始测试」按钮;没 figures 就跳过 figure 区域
6. **service 不直接读 package 文件**(除三个明确入口:解包校验、章节请求转发、搜索建索引)

## Wiki package 格式

### 文件:`<subject-slug>-<version>.wikipkg.tar.gz`

双扩展名 `.wikipkg.tar.gz` 给服务和工具识别。

### 目录布局

```
manifest.json                  ← 唯一入口
chapters/
  architecture-overview.md
  request-lifecycle.md
  ...
tours/
  <tour-slug>/
    00-overview.md
    01-<step-slug>.md
    ...
quizzes/
  architecture-overview.json   ← 与 chapter slug 对齐(惯例,非契约)
  ...
figures/
  architecture.svg
  ...
glossary.json
meta/
  README.md                    ← 可选
  CHANGELOG.md                 ← 可选
```

文件名都用 slug;**顺序由 manifest 决定,文件名永不参与排序**。

### manifest.json

```json
{
  "schema_version": "1.0",
  "content_type": "codebase",

  "subject": {
    "slug": "vllm",
    "name": "vLLM",
    "description": "High-throughput LLM inference engine",
    "language": "zh-CN"
  },

  "wiki_version": {
    "label": "v0.22.0",
    "generated_at": "2026-05-25T10:00:00Z",
    "generator": { "name": "codebase-wiki", "version": "2.0.0" }
  },

  "source": {
    "type": "codebase",
    "codebase": {
      "repo_url": "https://github.com/vllm-project/vllm",
      "target_ref": "v0.22.0",
      "target_commit": "abc1234",
      "deep_link_template": "https://github.com/vllm-project/vllm/blob/{commit}/{path}#L{line}"
    }
  },

  "chapters": [
    {
      "id": "architecture-overview",
      "order": 1,
      "title": "Architecture Overview",
      "path": "chapters/architecture-overview.md",
      "estimated_minutes": 12,
      "quiz_path": "quizzes/architecture-overview.json",
      "tags": ["overview"]
    }
  ],

  "tours": [
    {
      "id": "first-request",
      "title": "First request through vLLM",
      "overview_path": "tours/first-request/00-overview.md",
      "steps": [
        { "order": 1, "title": "Entry point", "path": "tours/first-request/01-entry-point.md" }
      ]
    }
  ],

  "glossary_path": "glossary.json",

  "figures": [
    { "id": "architecture", "path": "figures/architecture.svg", "title": "Layered architecture" }
  ]
}
```

关键设计:

- `schema_version` 是**整个包**的版本号,包内所有 JSON 共享
- `content_type` 是顶层 enum,v1 只接受 `"codebase"`,留位给 `"article" | "story" | "paper" | ...`
- `source.type` 与 `content_type` 对齐,具体源元信息在 `source.<type>` 子对象里(代码专属字段如 `target_commit`、`deep_link_template` 都在 `source.codebase` 内,不污染顶层)
- `subject.slug` 全 wiki 唯一(服务用它聚合多版本),`wiki_version.label` 在同 subject 下唯一
- `chapters[].id` 是 **slug-based,稳定**:重新生成时如果章节没变,id 不变 → 用户进度能跨版本保留
- `commit_url_template` 放在包里、不内置于 viewer,这样未来支持 GitLab/Bitbucket/self-hosted git 不动 viewer
- **章节 markdown 里的图片引用规则**:用标准 markdown `![alt](figures/architecture.svg)` 即可,viewer 将相对路径 resolve 到「该 wiki 的 content base URL」(由服务为该版本提供)。这**不违反**「viewer 只通过 manifest 读包」:viewer 不假设 `figures/` 目录结构,只 resolve 路径;`manifest.figures[]` 是给「figure 索引页 / 全文搜索」用的目录,inline 引用走 markdown 标准语义

### `quizzes/<chapter-slug>.json`

```json
{
  "schema_version": "1.0",
  "chapter_id": "architecture-overview",
  "questions": [
    {
      "id": "architecture-overview-q1",
      "type": "mcq-single",
      "stem": "Why does vLLM use PagedAttention?",
      "options": [
        { "id": "a", "text": "To compress weights" },
        { "id": "b", "text": "To page KV cache like virtual memory" },
        { "id": "c", "text": "..." },
        { "id": "d", "text": "..." }
      ],
      "answer": ["b"],
      "explanation": "Traditional contiguous KV allocation suffers from fragmentation...",
      "references": [
        { "chapter_id": "architecture-overview", "anchor": "memory-fragmentation" }
      ],
      "difficulty": "easy",
      "tags": ["memory", "attention"]
    }
  ]
}
```

- `type` v1 只 `mcq-single` / `mcq-multi`,留位给 `short-answer` / `code-fill`
- `answer` 始终是 array(单选时长度 1)—— viewer 判分逻辑统一
- `id` 稳定:`<chapter-slug>-q<N>`。重新生成时 q1 仍是 q1

### glossary.json

```json
{
  "schema_version": "1.0",
  "terms": [
    {
      "id": "kv-cache",
      "term": "KV cache",
      "aliases": ["key-value cache"],
      "definition": "Storage of attention keys/values across decoding steps...",
      "see_also": ["paged-attention", "block-manager"]
    }
  ]
}
```

### 未来扩展:其他 content_type

加 `article` 类型时,大概是这样(viewer/服务/DB 全部不动,只在 schema 多一个分支):

```json
{
  "content_type": "article",
  "source": {
    "type": "article",
    "article": {
      "title": "Understanding Transformers",
      "author": "...",
      "url": "https://...",
      "published_at": "2025-03-01"
    }
  }
}
```

`chapters / tours / quizzes / glossary / figures` 结构**一字不变**。

### 校验规则(服务上传时执行)

按顺序检查,任一失败即拒绝:

1. tar 解压成功,无 `..` 路径逃逸
2. 包根存在 `manifest.json`
3. `schema_version` MAJOR 在服务支持列表内(v1: `["1"]`),否则 `schema_unsupported`
3a. `content_type` 在服务支持列表内(v1: `["codebase"]`),否则 `content_type_unsupported`
4. zod 校验 manifest 结构
5. manifest 里声明的 path 必须实际存在
6. 包里**多余的文件**(未在 manifest 登记)→ 警告,不拒绝(给未来扩展留路)
7. 每个声明了 `quiz_path` 的 chapter,对应文件必须合法 JSON 且 ≥ 1 题
8. SVG 不含 `<script>` 标签(基础 XSS 防护);含 `<style>` 只警告不拒(v1)
9. `(subject, version)` 已存在且未 `?force=true` → 409 `wiki_version_exists`

## 服务组件 + API

### 组件职责

| 组件 | 职责 | 关键配置 |
|---|---|---|
| **Auth** | GitHub OAuth,session cookie | `GITHUB_CLIENT_ID/SECRET`、`ADMIN_GITHUB_LOGINS` |
| **WikiRegistry** | 解包/校验 tarball,登记 (subject, version) → 文件系统路径,管理 latest 指针 | `DATA_DIR`(默认 `/data`) |
| **ContentDelivery** | 把包里的 markdown / SVG / glossary / quiz 通过 manifest 转译成 API 响应;quiz **脱敏**(剥 answer / explanation) | `PUBLIC_READ`(默认 `true`)|
| **QuizGrading** | 接收答题,服务端持有标准答案,判分后写一条 attempt | — |
| **Progress** | 标记章节已读,查询用户在某 subject 上的进度 | — |
| **Addenda** | 用户提交章节 Q&A 反馈(append-only) | — |
| **Search** | SQLite FTS5 跨章节全文检索 | — |

权限边界:

- **匿名 / 登录权限**:由 `PUBLIC_READ` 控制。默认匿名可读(列表 / 章节 / tour / glossary / 公开 addenda);答题、进度、提交 addenda 都要登录
- **admin 来源**:env `ADMIN_GITHUB_LOGINS=xgliu515,foo,bar` 用 GitHub 用户名白名单。改 env 重启即可换 admin

### API 路由全表

API 前缀 `/api/v1`(API 版本与 schema_version 独立演进)。

**Auth**

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/auth/me` | 当前用户或 401 |
| GET | `/api/v1/auth/github/start` | 302 跳 GitHub |
| GET | `/api/v1/auth/github/callback` | 接 code,种 cookie,跳回前端 |
| POST | `/api/v1/auth/logout` | 清 cookie |

**Wiki Registry**

| 方法 | 路径 | 权限 |
|---|---|---|
| GET | `/api/v1/wikis` | 列所有 subject(每个 subject 的 latest 摘要) |
| GET | `/api/v1/wikis/:subject` | 列该 subject 所有版本 |
| GET | `/api/v1/wikis/:subject/:version/manifest` | 该版本 manifest |
| POST | `/api/v1/admin/wikis` | **admin** 上传 tarball(multipart) |
| POST | `/api/v1/admin/wikis/:subject/:version/latest` | **admin** 翻转 latest 指针 |
| DELETE | `/api/v1/admin/wikis/:subject/:version` | **admin** 软删除 |

**Content Delivery**

| 方法 | 路径 | 备注 |
|---|---|---|
| GET | `/api/v1/wikis/:subject/:version/chapters/:chapterId` | markdown 原文 + 元信息 |
| GET | `/api/v1/wikis/:subject/:version/tours/:tourId` | tour overview + step 列表 |
| GET | `/api/v1/wikis/:subject/:version/tours/:tourId/steps/:order` | tour 单步 markdown |
| GET | `/api/v1/wikis/:subject/:version/glossary` | 整张 glossary |
| GET | `/api/v1/wikis/:subject/:version/figures/:figureId` | SVG bytes(`Content-Type: image/svg+xml`) |
| GET | `/api/v1/wikis/:subject/:version/quizzes/:chapterId` | **脱敏后**的 quiz |
| GET | `/api/v1/wikis/:subject/:version/search?q=...` | FTS5 搜索 |

**Quiz**(需登录)

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/wikis/:subject/:version/quizzes/:chapterId/attempts` | 提交答案,返回完整判分 + 解析 |
| GET | `/api/v1/wikis/:subject/:version/quizzes/:chapterId/attempts` | 用户在该章节的尝试历史 |

**Progress**(需登录)

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/wikis/:subject/progress` | 该 subject 所有 chapter 的进度(跨版本聚合) |
| PUT | `/api/v1/wikis/:subject/:version/progress/:chapterId` | body `{ status: "read"\|"unread" }` |

**Addenda**

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/wikis/:subject/:version/chapters/:chapterId/addenda` | Q&A 列表(分页) |
| POST | `/api/v1/wikis/:subject/:version/chapters/:chapterId/addenda` | 提交,append-only |

### 关键行为细则

**quiz 脱敏**:服务**永不向客户端返回 `answer`**。
- `GET /quizzes/:chapterId` 返回字段:`{ id, type, stem, options, difficulty, tags }`
- `POST /attempts` 服务端在内存里对照答案判分,返回 `{ attempt_id, score, results: [{ qid, user_answer, correct, correct_answer, explanation, references }] }`

**上传原子化**:先写 `<DATA_DIR>/_staging/<random>/` → 全校验通过 → `BEGIN; INSERT wiki_versions; (UPDATE subjects.latest_version); COMMIT;` → `rename(staging, final)`。任一失败 → `rm -rf staging`,DB 不动。

**`?force=true` 语义**:删旧 `data_dir`,清旧 FTS 行,但**不动 progress / attempts / addenda**(它们靠 id 关联,内容更新不影响)。

**软删除**:DELETE 只写 `deleted_at`。磁盘清理是独立运维动作(手动脚本回收)。

**缓存**:静态内容 `Cache-Control: public, max-age=31536000, immutable`;用户态 `Cache-Control: no-store`。

**URL 标识**:`:subject` = subject.slug;`:version` = version label;`:chapterId / :tourId / :figureId` = 各自 slug。

## 数据库 schema(SQLite)

设计原则:

1. **可变状态全部在 DB,内容全部在文件系统**(`/data/wikis/<subject>/<version>/`)。DB 不复制 wiki 内容,只持有元信息 + 用户态
2. **progress 按 (user, subject, chapter)**:跨版本累加。`last_version_label` 仅审计
3. **attempts / addenda 按 (user, subject, version, chapter)**:与版本内容强绑
4. **软删除版本**:DELETE 只写 `deleted_at`,不丢用户态
5. **schema 迁移**:`schema_migrations` 表 + idempotent SQL,服务启动时自动跑

### 8 张表

```sql
CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  github_id     INTEGER NOT NULL UNIQUE,
  github_login  TEXT    NOT NULL,
  display_name  TEXT,
  avatar_url    TEXT,
  email         TEXT,
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL
);

CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,              -- 32-byte 随机 hex
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,              -- 30d 滚动续期
  last_used_at  INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);

CREATE TABLE subjects (
  slug            TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  language        TEXT NOT NULL,
  content_type    TEXT NOT NULL,
  latest_version  TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE wiki_versions (
  subject_slug    TEXT NOT NULL REFERENCES subjects(slug) ON DELETE CASCADE,
  version_label   TEXT NOT NULL,
  schema_version  TEXT NOT NULL,
  data_dir        TEXT NOT NULL,
  manifest_json   TEXT NOT NULL,                -- 内联缓存
  uploaded_by     INTEGER NOT NULL REFERENCES users(id),
  uploaded_at     INTEGER NOT NULL,
  deleted_at      INTEGER,
  PRIMARY KEY (subject_slug, version_label)
);
CREATE INDEX idx_wiki_versions_uploaded_at ON wiki_versions(uploaded_at);

CREATE TABLE progress (
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_slug        TEXT NOT NULL,
  chapter_id          TEXT NOT NULL,
  status              TEXT NOT NULL,            -- "read" | "unread"
  last_version_label  TEXT NOT NULL,
  marked_at           INTEGER NOT NULL,
  PRIMARY KEY (user_id, subject_slug, chapter_id)
);

CREATE TABLE attempts (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_slug    TEXT NOT NULL,
  version_label   TEXT NOT NULL,
  chapter_id      TEXT NOT NULL,
  attempted_at    INTEGER NOT NULL,
  results_json    TEXT NOT NULL,
  score           REAL NOT NULL,
  question_count  INTEGER NOT NULL
);
CREATE INDEX idx_attempts_user_chapter
  ON attempts(user_id, subject_slug, chapter_id, attempted_at);
CREATE INDEX idx_attempts_user_subject
  ON attempts(user_id, subject_slug);

CREATE TABLE addenda (
  id              INTEGER PRIMARY KEY,
  subject_slug    TEXT NOT NULL,
  version_label   TEXT NOT NULL,
  chapter_id      TEXT NOT NULL,
  author_user_id  INTEGER NOT NULL REFERENCES users(id),
  question        TEXT NOT NULL,
  answer          TEXT,
  created_at      INTEGER NOT NULL,
  hidden_at       INTEGER
);
CREATE INDEX idx_addenda_chapter
  ON addenda(subject_slug, version_label, chapter_id, created_at);

CREATE VIRTUAL TABLE content_fts USING fts5(
  subject_slug   UNINDEXED,
  version_label  UNINDEXED,
  doc_type       UNINDEXED,
  doc_id         UNINDEXED,
  title,
  body,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TABLE schema_migrations (
  id          INTEGER PRIMARY KEY,
  applied_at  INTEGER NOT NULL,
  description TEXT NOT NULL
);
```

### 容量预估(100 用户 / 5 个 wiki / 各 3 版本)

- users / sessions / subjects / wiki_versions:< 200 行
- progress:100 × 5 × 12 ≈ 6 000 行
- attempts:平均 2 次/章 ≈ 12 000 行
- addenda:< 1 000 行
- content_fts:< 500 行 + 索引

SQLite 单文件 < 20 MB,FTS 索引 < 100 MB。完全 fit-in-memory。

## Viewer 改造

### 仓库结构(monorepo workspaces)

```
server/                       Node + Hono 服务
viewer/                       浏览器侧 TS
  src/
    main.ts
    router.ts
    api/client.ts             /api/v1/* 封装(类型安全)
    pages/                    页面级编排
    components/               复用部件
    state.ts theme.ts
  index.html                  HTML shell 模板
  styles/main.css
shared/                       两侧共享
  schemas.ts                  zod schemas → 派生 TS 类型
package.json                  workspaces: ["server", "viewer", "shared"]
```

### 共享类型(关键)

`shared/schemas.ts` 用 zod 一次性定义 ManifestSchema / QuizSchema / GlossarySchema / AttemptResultSchema。

- 服务端:上传时 `ManifestSchema.parse(json)`,通过即类型安全
- viewer:`/api/v1/.../manifest` 响应同样 `.parse()`,通过即拿强类型
- schema 演进时:`shared/schemas.ts` 是**唯一变更点**,两侧编译错误立刻指出受影响位置

### 构建工具链

最小化:`tsc --noEmit` 类型检查 + `esbuild --bundle` 打成单 `viewer/dist/bundle.js`(+ source map)。

- 没有前端框架(允许一个 ~150 行的小 `h()` helper)
- 没有 CSS 预处理器
- 服务静态托管 `bundle.js` 和 `main.css`

### Server 注入的初始状态

服务返回的 HTML shell:

```html
<script>
window.__INITIAL__ = {
  user: { id: 12, login: "xgliu515", avatar_url: "..." } /* or null */,
  route: { subject: "vllm", version: "v0.22.0", chapter: "architecture-overview" },
  build: { version: "2.0.0" }
};
</script>
<script type="module" src="/static/bundle.js"></script>
```

首屏不闪,无需先 `/api/auth/me` 探一次。

### 模块迁移清单

| 来源 | 去向 | 状态 |
|---|---|---|
| `content.js` | `MarkdownRenderer.ts` | 移植 |
| `glossary.js` | `GlossaryPanel.ts` | 移植 |
| `sidebar.js` | `Sidebar.ts` | 移植 |
| `search.js` | `SearchBox.ts` | 改造(请求改走 API) |
| `diagrams.js` | `FigureRenderer.ts` | 改造(剥 inline style,注入主题变量) |
| `architecture.js` | — | **删** |
| `chapters.js` | — | **删**(manifest 改从 API 取) |
| `versions.js` | — | **删**(改走 API) |
| `strings.js` | `i18n.ts` | 移植 |
| `utils.js` | `utils.ts` | 移植 |
| `app.js` | `main.ts` + `router.ts` | 重写(history API 路由) |
| `css/style.css` | `styles/main.css` | 移植 |

约 60% 既有 viewer 代码以 1:1 重写为 TS 的方式保留。

### 新增组件

- `AuthButton.ts` — 登录 / 头像 / 登出
- `QuizCard.ts` — 章节底「开始测试」按钮 + MCQ UI + 结果展示
- `ProgressBar.ts` — subject 主页顶部进度条
- `AddendaList.ts` — 章节末 Q&A 列表 + 提交表单
- `AdminUpload.ts` — `/admin` 拖拽上传 tarball + 校验进度

### 路由

History API,服务端 catch-all 把 `/wiki/*` 等回退到 shell:

| URL | 页面 |
|---|---|
| `/` | 所有 subjects 列表 |
| `/wiki/:subject` | 该 subject 版本列表 |
| `/wiki/:subject/:version` | 版本概览(章节目录 + tours 入口) |
| `/wiki/:subject/:version/chapter/:chapterId` | 章节阅读 |
| `/wiki/:subject/:version/chapter/:chapterId/quiz` | 章节测验 |
| `/wiki/:subject/:version/tour/:tourId` | tour 概览 |
| `/wiki/:subject/:version/tour/:tourId/:step` | tour 单步 |
| `/wiki/:subject/:version/search?q=...` | 搜索 |
| `/me` | 个人主页 |
| `/admin` `/admin/upload` | 管理 |

### SVG 主题注入

`FigureRenderer.ts` 收到 SVG bytes 后:DOMParser 解析 → 移除任何 `<style>` 标签 → 给根 SVG 加 `data-figure="<id>"` → CSS 通过 `[data-figure] [data-role="..."]` 选中元素,主题切换自动跟随。

SVG 生成模板须遵守:**所有 stroke/fill 元素打 `data-role="..."`,严禁 inline style**(已有 `templates/svg-style-guide.md` 延续即可)。

## 版本兼容策略

### 四种独立版本

| 版本 | 标识 | 控制权 | 演进节奏 |
|---|---|---|---|
| **package schema_version** | manifest.`schema_version` | 生成器决定 | 慢(数据契约) |
| **wiki content version** | `wiki_version.label`(如 `v0.22.0`) | 每次生成 | 高 |
| **service API version** | URL `/api/v1/...` | 服务 | 中 |
| **generator version** | `generator.version` | skill | 信息字段,不参与兼容 |

每种各自演进,**不联动**。

### package schema_version 规则

`MAJOR.MINOR`(无 PATCH)。

**MINOR(additive-only,随时兼容)**:
- 在任意对象加**可选**字段
- 加新 `quiz.type` 值(可选)
- 放松数值/字符串约束

**MAJOR(破坏式,需服务/viewer 显式适配)**:
- 删字段 / 改字段名 / 改语义
- 可选 → 必选
- 字段位置移动
- 收紧约束

### 服务的兼容矩阵

服务硬编码支持列表:`SUPPORTED_SCHEMA_MAJORS = ['1']`。

| 服务支持 | 包 schema | 结果 |
|---|---|---|
| `1.x` | `1.0` / `1.5` | ✅ 接受(MINOR 多余字段保留但忽略) |
| `1.x` | `2.0` | ❌ `schema_unsupported` |
| `1.x` 和 `2.x` 都支持 | `1.0` | ✅ 走 1.x 解析路径 |

### Adapter 模式而非 Migration

未来引入 `2.x` 时:
- `shared/schemas.ts` 同时保留 `ManifestV1Schema` + `ManifestV2Schema`
- 内部统一用「当前 MAJOR」视图
- V1 包通过 `adaptV1ToV2(manifest)` 在读取时转换,**磁盘上的包不动**

为什么不在上传时 migrate:
1. 包是 immutable 事实
2. adapter 有 bug 改 adapter 即可
3. 弃支某 MAJOR 时只需删 adapter

例外:V1 包在 V2 视图下「无法表达」时,加载报错,admin 用 skill v2 重新生成并 `?force=true` 覆盖 —— **用户进度/答题不丢**(id 不变就还在)。

### 服务 API version 独立

`/api/v1 → /api/v2` 与 wiki 包格式无关。服务可在新 API 引入流式响应、新字段;同时继续消费 `schema_version: 1.x`。

`/api/v1/healthz` 返回 `{ ok: true, server_version: "2.0.0", supported_schema_majors: ["1"] }`。

### 弃用 / 退役流程

退役 `schema_version 1.x` 时:
1. 服务发版前公告(`supported_schema_majors` 已暴露)
2. 新版服务移除 `'1'`,删 adapter
3. 已上传的 1.x 包加载失败 → admin 面板高亮,admin 用 skill 重生覆盖
4. 用户数据全部保留

## 错误处理 + 边界

### 整体原则

1. 失败要早 —— 上传时拦截的事不留到运行时
2. 写操作要原子 —— 解包、addenda、attempt 全部 transactional
3. 错误响应统一形状:`{ "error": "<code>", "message": "<human>" }` + HTTP status
4. 服务永不 panic —— handler 包裹错误边界,意外异常 500 + `request_id` 记日志

### 上传管线(失败模式)

| 阶段 | 失败 | HTTP | code |
|---|---|---|---|
| 接收 | > 50 MB | 413 | `payload_too_large` |
| 接收 | 非 tar.gz / 解压失败 | 400 | `invalid_archive` |
| 解包 | 路径 `..` / 绝对路径 | 400 | `path_traversal` |
| 解包 | 文件数 > 10000 / 单文件 > 10MB | 400 | `archive_bombsuspect` |
| manifest | 缺 / parse 失败 | 400 | `manifest_missing` / `manifest_malformed` |
| schema | MAJOR 不支持 | 400 | `schema_unsupported` |
| schema | content_type 不支持 | 400 | `content_type_unsupported` |
| schema | zod 校验失败 | 400 | `manifest_invalid` |
| 引用 | path 文件不存在 | 400 | `referenced_file_missing` |
| 内容 | SVG 含 `<script>` | 400 | `svg_unsafe` |
| 内容 | quiz 0 题 / answer 引用未知 option | 400 | `quiz_empty` / `quiz_answer_invalid` |
| 注册 | `(subject, version)` 已存在 | 409 | `wiki_version_exists` |
| 落盘 | IO 错 | 500 | `storage_failed` |

### 读取时

| 失败 | HTTP | code |
|---|---|---|
| subject / version / chapterId 不存在(含软删除) | 404 | `*_not_found` |
| DB 存在但磁盘缺失 | 500 | `storage_inconsistent` |

「DB 存在但磁盘缺失」时:日志 ERROR + 自动给 `wiki_versions` 写 `deleted_at`(自愈),admin 面板高亮提示。

### Auth

- 未登录访问需登录接口 → 401 `unauthorized`
- OAuth state mismatch → 400 `oauth_state_invalid`
- 非 admin 访问 admin → 403 `forbidden`
- Session 过期 → 401 `session_expired`
- 每用户活跃 session ≤ 20(超过删最旧)

### Quiz / Progress / Addenda

- 章节无 quiz → 404 `quiz_not_found`
- answers 含未知 qid / option → 400
- answers 含服务端字段(`correct`/`explanation`)→ 400 `quiz_redacted_field`
- attempt rate limit:同 user 同 chapter 10s 内 ≥ 5 次 → 429
- addendum:question 空 / > 2000 字 → 400
- addendum rate limit:同 user 同 chapter 1h 内 ≥ 10 条 → 429

判分时 quiz 文件读取失败:返回 500,attempt **不入库**(防止中间态)。

### 并发(SQLite WAL + 单进程)

- 两 admin 同时上传同 (subject, version) → INSERT 冲突,后到者 409
- 同用户两 tab 标记已读 → PRIMARY KEY 冲突 → `INSERT OR REPLACE`,幂等
- 同用户两 tab 提交 quiz → 两条独立 attempt,UI 各显示
- addendum 写 + FTS 索引 → 同事务,rollback 一致

### 资源限制(env 配置默认值)

```
MAX_TARBALL_BYTES=52428800            # 50 MB
MAX_FILES_PER_TARBALL=10000
MAX_FILE_SIZE_BYTES=10485760          # 10 MB
MAX_ADDENDA_PER_HOUR_PER_USER=30
MAX_ATTEMPTS_PER_10S_PER_CHAPTER=5
MAX_SEARCH_QUERY_LENGTH=200
SESSION_MAX_PER_USER=20
SESSION_TTL_DAYS=30
```

### 输入合法性

```
slug:           ^[a-z0-9][a-z0-9-]{0,63}$
version_label:  ^v?[0-9][0-9a-zA-Z.\-+]{0,63}$
```

所有 manifest 路径在解包时必须 resolve 后仍在 staging_dir 内,否则 `path_traversal`。

### Frontend 错误 UX

| 错误 | UI |
|---|---|
| 401 | toast「需要登录」+ 登录按钮 |
| 403 | toast「权限不足」+ 回上一页 |
| 404 | 整页空状态 + 回首页 |
| 429 | toast + `Retry-After` |
| 5xx | toast「服务暂不可用」+ `request_id` |
| 网络中断 | toast「网络异常,请刷新」 |

统一 `notify(level, message)` 模块,不弹原生 alert。

### 监控事件名(契约稳定)

- `wiki.upload.success` / `.failed`
- `auth.login.success` / `.failed`
- `quiz.attempt.submitted` / `.error`
- `addendum.created`
- `storage.inconsistent`(关键)

v1 只写 stdout,未来接 Prometheus / Sentry 以这些事件名为接口。

## 已设计好的扩展位

| 扩展位 | 加东西时的改动 |
|---|---|
| 新内容类型(article/story/paper/...) | 加 `content_type` 值 + `source.<type>` 分支 + skill 子产物;manifest 其余/服务/DB/viewer 路由全部不动 |
| 新题型(short-answer / code-fill) | quiz JSON 加 `type` 值;viewer 加 `QuizCard` 分支;`attempts.results_json` schema 自然兼容 |
| 新功能(笔记 / 评论 / 学习路径) | 加新 DB 表 + 新 `/api/v1/...` + 新 viewer 组件。**wiki 包零改动** |
| 多语言 viewer | i18n 模块已预留,加 locale 文件即可 |
| schema MINOR 升级 | additive-only,自动兼容 |
| schema MAJOR 升级 | 加 adapter,见上 |

## 已知风险(v1 不解决)

| 风险 | 应对 |
|---|---|
| 单进程 SQLite 写锁瓶颈 | 自部署 < 数百用户场景充分;撞墙再迁 Postgres |
| FTS5 中文分词效果一般 | `unicode61` 已够搜词;高质量中文检索是 v2 工程项 |
| admin 误传覆盖现有版本 | `?force=true` 显式 + UI 二次确认;但仍会丢「该版本 wiki 内容」(用户数据不丢) |
| LLM 调用进入 v2 后的 prompt 注入 | v2 单列设计文档 |

## 与现有静态 wiki 的关系

- 现存 vllm-wiki 等继续在 GitHub Pages 只读运行
- skill v2 默认产 `.wikipkg.tar.gz`,通过新增 mode 触发(老 mode 保留过渡期)
- 老 mode 在某版本后 deprecated 再删除,**节奏由用户而非时间表决定**

## 显式不做的事

- email/password 认证
- wiki 内置评论 / 社交
- wiki 包内嵌呈现选项(主题/布局/CSS)
- viewer 多框架支持(React/Vue/Svelte)
- 数据格式的 PATCH 版本号(改了就是 MINOR 或 MAJOR)

## 决策记录(brainstorming 期间确认的关键选择)

| 议题 | 选择 |
|---|---|
| 服务与 viewer 关系 | 服务取代静态 viewer(不并存) |
| 部署形态 | 可自部署开源,SQLite 优先 |
| 测试题型(v1) | 仅 MCQ |
| 测试触发 | 读完一章后 |
| 认证 | GitHub OAuth |
| wiki 上传方式 | Admin UI 上传 tarball |
| 现有 wikis | 不迁移 |
| 技术栈 | Node + TS + Hono + better-sqlite3 |
| 渲染模型 | Hybrid:服务端 HTML 壳 + 客户端渲染内容 + JSON API |
| 数据格式 | 顶层 `content_type` + `source.<type>` 子对象,v1 仅 `codebase` |
| schema 演进 | MAJOR.MINOR,MINOR additive-only,MAJOR 用 adapter 不 migrate |
| progress 版本性 | 跨版本累加(按 chapter_id) |
| attempts / addenda 版本性 | 强绑版本 |
| 前端 | vanilla TS + 单 bundle,无框架 |
| 共享契约 | `shared/schemas.ts`(zod)作为唯一来源 |
