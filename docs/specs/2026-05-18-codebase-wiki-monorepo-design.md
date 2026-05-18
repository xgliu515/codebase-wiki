# 设计文档:codebase-wiki mono-repo 支持(skill v3)

- 日期:2026-05-18
- 状态:已定稿,待评审
- 范围:mono-repo 布局 + 已有 wiki 的导入流程。不含 diff 增量、跨项目深链映射。
- 前序:`2026-05-18-codebase-wiki-versioning-design.md`(版本化,已实现并合并)

## 1. 背景与问题

codebase-wiki skill 现在为每个目标代码库生成一个独立的 wiki 仓库。版本化功能(已实现)让单个 wiki 仓库能容纳同一项目的多个版本:`仓库 → 版本 → wiki` 两级结构。

用户已用本工具生成了多个 wiki,每个各占一个 git 仓库。维护 N 个仓库成本高。由于版本化机制本质上就是「在一个仓库里按子目录组织多份 wiki」,把它再往上推一层——一个仓库容纳多个项目——是自然的推广。

需求:skill 改为始终生成 / 追加到一个 **mono-repo**,三级结构 `mono-repo → 项目 → 版本 → wiki`;并提供把已有独立 wiki 仓库导入 mono-repo 的流程。

## 2. 目标与非目标

### 目标

- skill 始终以 mono-repo 布局工作:一个 git 仓库容纳多个项目,每个项目容纳多个版本。
- 顶层有项目选择页;每个项目下有版本选择页;查看器内同时有项目下拉与版本下拉。
- skill 再次运行时识别 mono-repo,正确区分「新增项目」与「给已有项目追加版本」。
- 提供导入流程,把已有的独立 wiki 仓库(扁平布局或已版本化布局)迁入 mono-repo。

### 非目标(本轮明确不做)

- 单项目独立仓库布局——已废弃,skill 不再生成。
- diff 增量更新。
- 跨项目 / 跨版本深链映射(切换时定位到同名章节)。
- 删除导入的源仓库(导入是拷贝,源保留)。
- 每项目独立域名 / 独立 Pages。

## 3. 目录布局

mono-repo 是三级树。版本化结构整体下移一层:原来在仓库根的版本选择页移到 `<项目>/`,仓库根换成项目选择页。

```
wikis/                          (mono-repo, GitHub Pages 从 main / 发布)
├── index.html                  项目选择页(来自 templates/project-index.html)
├── selector.css                选择页样式,项目页与版本页共用一份
├── projects.json               项目清单 —— 顶层唯一索引
├── README.md  LICENSE  .gitignore
├── vllm/
│   ├── index.html              版本选择页(来自 templates/version-index.html)
│   ├── versions.json           该项目的版本清单
│   ├── v0.22.0/                完整、自包含的 wiki
│   │   ├── index.html
│   │   ├── 01-...md ... 12-glossary-and-faq.md
│   │   ├── tour-00-overview.md ... tour-NN-*.md
│   │   └── web/  (css/  js/)
│   └── v0.21.1/
└── react/
    ├── index.html
    ├── versions.json
    └── v18.2.0/
```

设计原则:

- 每个 `<项目>/<版本>/` 仍是完整、自包含、可独立运行的 wiki。
- 相对路径天然适配三级布局,无需改 fetch 路径:viewer 在 `<项目>/v<x>/`,版本下拉 `fetch('../versions.json')` 命中 `<项目>/versions.json`;项目下拉 `fetch('../../projects.json')` 命中根级 `projects.json`。
- `selector.css` 仅在仓库根放一份。项目选择页引用 `selector.css`,版本选择页引用 `../selector.css`。

## 4. projects.json

仓库根的 `projects.json` 是项目层的唯一事实来源。项目选择页和查看器的项目下拉都运行时 fetch 它。

```json
{
  "title": "Codebase Wikis",
  "projects": [
    {
      "dir": "vllm",
      "name": "vLLM",
      "github": "vllm-project/vllm",
      "tagline": "为深入学习 vLLM 源码而写的可查询参考文档",
      "versions": 2,
      "latest": "v0.22.0",
      "updated": "2026-05-18"
    },
    {
      "dir": "react",
      "name": "React",
      "github": "facebook/react",
      "tagline": "...",
      "versions": 1,
      "latest": "v18.2.0",
      "updated": "2026-04-01"
    }
  ]
}
```

字段说明:

- `dir` — 项目子目录名,也是路由标识。由 `slug(name)` 派生。
- `name` — 项目友好名,显示在选择页卡片与查看器项目下拉。
- `github` — 目标代码的 GitHub repo(`owner/repo`),显示用。
- `tagline` — 一句话简介,显示在项目卡片。
- `versions` — 该项目当前的版本数。
- `latest` — 该项目最新版本的目录名(等于其 `versions.json` 里 `latest` 那条的 `dir`)。
- `updated` — 该项目最近一次生成 / 追加的日期(ISO)。

数组按 `updated` 倒序(最近更新在前)。新增项目 = push 一条;给项目追加版本 = 更新该条的 `versions` / `latest` / `updated` 并移到数组头部。

## 5. 项目目录命名规则

项目子目录名 `dir` 由 `name` 派生:小写,非字母数字字符替换为 `-`,首尾 `-` 去除(与现有 `STORAGE_PREFIX` 的 slug 规则一致)。

若推导出的项目目录已存在但本次意图是「新增项目」(而非追加版本),说明项目名冲突 —— skill 必须停下来询问用户:这是否就是同一项目(转为追加版本),还是需要换一个目录名。不得静默合并或覆盖。

版本目录命名规则不变,沿用版本化设计:精确 tag,否则 `<分支>-<短SHA>`。

## 6. skill 工作流改动

skill 运行时探测输出目录,进入三种模式之一。mono-repo only —— 不再有单项目独立仓库布局。

| 探测到 | 模式 | 动作 |
|--------|------|------|
| 无 `projects.json`,目录空 / 不存在 | 新建 mono-repo | 建仓库 + 第一个项目 |
| 有 `projects.json`,目标项目目录不存在 | 新增项目 | 在 mono-repo 里加一个项目 |
| 有 `projects.json`,目标项目目录已存在 | 追加版本 | 给已有项目加一个版本 |

### 6.1 Phase 0(收集输入)

- 探测输出目录,确定模式。
- 新建 mono-repo:照常收集代码库路径、项目名、GitHub repo、语言、锁定版本。
- 新增项目:已有 mono-repo,读出 `projects.json` 告知用户已有哪些项目;收集新项目的输入。
- 追加版本:读出该项目的 `versions.json` 告知已有版本;只收集新版本目标代码的路径与 ref。
- 推导项目目录名(第 5 节)与版本目录名。目录冲突按第 5 节 / 版本化设计处理。

### 6.2 Phase 4(web 设置)

本版本的全部输出——`index.html`、所有 `.md`、`web/`——写进 `<项目>/<版本>/`。`web/` 含 `versions.js`(已带项目下拉逻辑,见第 8 节)。

### 6.3 Phase 7(发布)

- **新建 mono-repo**:
  1. `git init -b main`
  2. 写根级 `index.html`(项目选择页)、`selector.css`、`README.md`、`LICENSE`、`.gitignore`
  3. 建 `<项目>/`:版本选择页 `index.html`、`versions.json`(单条)、首个 `v<x>/`
  4. 写根级 `projects.json`(单条)
  5. 提交,确认后推送,开启 GitHub Pages
- **新增项目**:
  1. mono-repo 已存在,建新的 `<项目>/`(版本选择页 + `versions.json` 单条 + 首个 `v<x>/`)
  2. 往 `projects.json` 的 `projects` 数组头部 push 新条目
  3. 根级 `index.html` / `selector.css` 不动
  4. 提交并推送
- **追加版本**:
  1. 在 `<项目>/` 下新增 `v<x>/`
  2. 更新 `<项目>/versions.json`(头部 push 新条目,翻转 `latest`)
  3. 更新 `projects.json` 中该项目条目的 `versions` / `latest` / `updated`,并移到数组头部
  4. 根级 `index.html` / `selector.css` 与其他项目目录不动
  5. 提交并推送

## 7. 导入已有 wiki 仓库

导入流程把已有的独立 wiki 仓库迁入 mono-repo。它是一个独立入口,可对多个源仓库批量执行。

### 7.1 输入

- 一个或多个源 wiki 仓库的路径。
- 目标 mono-repo 的路径(可以是已存在的 mono-repo,也可以是空目录 —— 空目录时先按「新建 mono-repo」初始化根级文件)。

### 7.2 单个源仓库的导入步骤

1. **探测源布局**:源仓库根有 `versions.json` → 已版本化布局;只有根级 `index.html` + `web/js/chapters.js` → 扁平布局。
2. **读取项目身份**:从源的 `web/js/chapters.js` 读 `PROJECT_NAME`、`PROJECT_GITHUB_REPO`。已版本化源取其最新版本目录下的 `chapters.js`。推导项目目录名 = `slug(PROJECT_NAME)`。
3. **扁平源**:执行「扁平→版本化」迁移(沿用版本化设计的迁移逻辑:从 `ANALYZED_TAG` 推导 `v<x>/`,无 tag 用 `ANALYZED_COMMIT`),产出落到 `<mono>/<项目>/v<x>/`,并生成 `<mono>/<项目>/index.html`(版本选择页)与 `<mono>/<项目>/versions.json`(单条)。迁移含「给老查看器注入版本下拉 + 把老 `chapters.js` 升级为版本感知 `STORAGE_PREFIX`」(版本化设计已定义)。
4. **已版本化源**:把源仓库内容(除 `README.md` / `LICENSE` / `.gitignore` / `.git/`)整体拷入 `<mono>/<项目>/`。
5. **注入项目下拉**:无论扁平还是已版本化源,导入后该项目所有版本的查看器都需要项目下拉。把含 `initProjectSwitcher` 的 `versions.js`(第 8 节)同步进各版本的 `web/js/`,并在各版本 `index.html` 顶栏加项目下拉占位、`app.js` 加初始化调用、`style.css` 加样式。仅改导航 chrome,不动章节 `.md`。
6. **注册项目**:把该项目写入根级 `projects.json`;确保根级 `index.html`(项目选择页)、`selector.css` 存在。
7. **源仓库不删**:导入是拷贝,源仓库原样保留。

### 7.3 兼容性与边界

- 导入前若涉及大量文件移动 / 拷贝,skill 须先向用户说明并取得确认。
- 项目目录名冲突(两个源 wiki 同名)→ 询问用户换名或合并。
- 已版本化源的 `selector.css`:源仓库根原有一份 `selector.css`,拷入 `<项目>/` 后是多余的;导入时删除 `<项目>/selector.css`,版本选择页改引 `../selector.css`(见第 8 节)。

## 8. 查看器与选择页改动

### 8.1 两个选择页

- **项目选择页** `templates/project-index.html` → mono-repo 根 `index.html`。fetch `projects.json`,卡片列出所有项目:`name`、`tagline`、`github`、`versions`、`latest`、`updated`。点击进入 `<dir>/index.html`。引用 `selector.css`。
- **版本选择页** `templates/version-index.html`(已存在,沿用)→ `<项目>/index.html`。两处改动:顶部加一个「← 所有项目」链接(指向 `../index.html`);样式表引用从 `selector.css` 改为 `../selector.css`。

两个选择页结构同构,共用根级 `selector.css`。

### 8.2 查看器项目下拉

在 `templates/web/js/versions.js` 中新增 `initProjectSwitcher()` 函数,与已有的 `initVersionSwitcher()` 同构:

- fetch `../../projects.json`。
- 在顶栏渲染项目下拉,当前项目高亮。当前项目目录名由 `location.pathname` 推导(倒数第二段,即版本目录的上一级)。
- 切换项目 → 跳转到 `../../<dir>/index.html`(目标项目的版本选择页)。
- fetch 失败时静默隐藏。

`templates/index.html` 顶栏加项目下拉占位元素(如 `<select id="project-switcher">`),位置在版本下拉旁。`templates/web/js/app.js` 在 `main()` 中调用 `initProjectSwitcher()`。`templates/web/css/style.css` 加项目下拉样式(可复用 `.version-switcher` 规则,或新增 `.project-switcher`)。

### 8.3 当前项目目录推导

查看器在 `<mono>/<项目>/<版本>/` 下运行。`location.pathname` 形如 `/wikis/vllm/v0.22.0/index.html`。已有的 `getCurrentVersionDir()` 取最后一个非 `.html` 段(`v0.22.0`)。新增 `getCurrentProjectDir()` 取其上一级段(`vllm`)。两者都加进 `chapters.js` 并导出。

`STORAGE_PREFIX` 已含 `PROJECT_NAME` 与版本目录名,mono-repo 同源下多项目多版本不会撞 localStorage,无需再改。

## 9. 文件改动清单

### 改动现有文件

- `SKILL.md`:Phase 0 三模式探测(新建 mono-repo / 新增项目 / 追加版本)、Phase 4 输出到 `<项目>/<版本>/`、Phase 7 三模式发布、新增导入流程章节。
- `reference/workflow.md`:同步三模式与导入流程。
- `reference/versioning.md`:更新为「版本层在项目层之下」,与 mono-repo 文档交叉引用。
- `templates/index.html`:顶栏加项目下拉占位。
- `templates/web/js/versions.js`:新增 `initProjectSwitcher()`。
- `templates/web/js/app.js`:`main()` 中初始化项目下拉。
- `templates/web/js/chapters.js`:新增并导出 `getCurrentProjectDir()`。
- `templates/web/css/style.css`:项目下拉样式。
- `templates/version-index.html`:加「← 所有项目」链接;`selector.css` 路径改 `../selector.css`。
- `templates/readme.md.tmpl`:说明 mono-repo 三级布局与访问方式。

### 新增文件

- `templates/project-index.html`:项目选择页模板。
- `templates/projects.json`:`projects.json` 的 schema 示例。
- `reference/monorepo.md`:三级布局、projects.json schema、项目命名规则、三模式、导入流程的完整参考说明。

## 10. 错误处理与边界情况

- 项目目录名冲突且意图为新增项目 → 询问用户换名 / 转为追加版本;不静默合并。
- `projects.json` 损坏 / 格式非法 → 报错并请用户确认;不静默重建。
- 导入涉及大量文件移动 → 须先取得用户确认。
- 选择页 / 查看器 fetch 清单失败 → 对应下拉或列表静默降级,不影响其余功能。
- 已版本化源导入后遗留的 `<项目>/selector.css` → 导入时清理,版本选择页改引 `../selector.css`。
- 导入的源仓库始终保留,不删除。

## 11. 验证

完成后需验证:

- 新建 mono-repo:空目录生成出三级布局,项目选择页列出唯一项目,进入后版本选择页与查看器正常。
- 新增项目:对已有 mono-repo 再跑一次新项目,新增 `<项目>/` 目录,`projects.json` 正确 push,旧项目不受影响。
- 追加版本:对 mono-repo 里已有项目追加版本,`<项目>/versions.json` 与 `projects.json` 对应条目同步更新。
- 导入扁平源:对一份老扁平 wiki 执行导入,内容落到 `<项目>/v<x>/`,版本选择页 / 项目下拉 / 版本下拉齐备,`projects.json` 注册正确。
- 导入已版本化源:对一份已版本化 wiki 执行导入,内容落到 `<项目>/`,各版本查看器获得项目下拉,遗留 `selector.css` 被清理。
- 查看器双下拉:在某项目某版本的查看器内,项目下拉切到另一项目跳到其版本选择页,版本下拉切到本项目另一版本跳到其首页。
- localStorage:不同项目 / 版本的阅读状态互不串扰。
