# 设计文档:codebase-wiki 版本化(skill v2)

- 日期:2026-05-18
- 状态:已定稿,待评审
- 范围:仅版本化。多服务支持、diff 增量更新不在本轮。

## 1. 背景与问题

当前 codebase-wiki skill 把生成的 wiki 输出成**扁平单版本**布局:`index.html`、所有 `.md`、`web/` 都直接放在仓库根。Phase 7 用 `git init -b main` 假设是全新空仓库。

目标代码会持续演进。现状下,代码更新后只能整体重生成、覆盖旧内容,无法同时保留多个版本的 wiki。`README.md` 模板里甚至直接写「未来代码更新后想看新版,自己 grep」——等于承认不支持更新。

需求:让 wiki 仓库能容纳**多个版本**,每次目标代码出新版就生成一份新的、与该版本对应的 wiki,旧版本同时可在线访问。

## 2. 目标与非目标

### 目标

- wiki 仓库支持多版本共存,每个版本一个自包含子目录。
- 顶层有版本选择页;查看器内有版本下拉,可直接切换。
- skill 再次运行时能识别已有 wiki 仓库并追加新版本,不破坏旧版本。
- 能迁移**老 skill 生成的扁平 wiki**到新的版本化布局。

### 非目标(本轮明确不做)

- diff 增量更新(只重写受影响章节)。本轮每次都是全量重生成,即「大版本思路」。
- 多服务 / 多 trace tour 支持。
- `latest/` 软目录。顶层选择页已能标记 latest。
- 跨版本深链映射(切换版本时尝试定位到同名章节)。
- 查看器代码去重。每版本自包含一份 `web/` 是有意为之。

## 3. 目录布局

生成的 wiki 仓库布局:

```
xxx-wiki/                       (git 仓库, GitHub Pages 从 main / 发布)
├── index.html                  顶层版本选择页(静态模板, 运行时 fetch versions.json)
├── selector.css                选择页样式
├── versions.json               版本清单 —— 唯一的索引
├── README.md  LICENSE  .gitignore
├── v0.22.0/                    一个完整、自包含的 wiki
│   ├── index.html
│   ├── 01-architecture-overview.md ... 12-glossary-and-faq.md
│   ├── tour-00-overview.md ... tour-NN-*.md
│   └── web/  (css/  js/)
├── v0.21.1/                    上一版, 结构同上, 完全独立
│   └── ...
└── main-a1b2c3d/               无 tag 时的命名示例
    └── ...
```

设计原则:**每个版本子目录是一份完整、自包含、可独立运行的 wiki**。版本之间不共享任何文件。一个版本生成后即冻结,后续 skill 升级不会改动它(迁移注入版本下拉是唯一例外,见第 7 节)。

## 4. versions.json

顶层 `versions.json` 是整个版本化体系**唯一的事实来源**。顶层选择页和各版本查看器的下拉都运行时 fetch 它来渲染。

```json
{
  "project": "vLLM",
  "versions": [
    {
      "dir": "v0.22.0",
      "label": "v0.22.0",
      "commit": "abc1234",
      "target_ref": "v0.22.0",
      "date": "2026-05-18",
      "latest": true
    },
    {
      "dir": "v0.21.1",
      "label": "v0.21.1",
      "commit": "0867497",
      "target_ref": "v0.21.1",
      "date": "2026-04-01",
      "latest": false
    }
  ]
}
```

字段说明:

- `dir`:版本子目录名,也是路由用的标识。
- `label`:下拉和卡片上显示的版本名。默认等于 `dir`。
- `commit`:目标代码被分析的 commit 短 SHA。
- `target_ref`:目标代码的 tag 或分支名,用于展示「这一版分析的是什么」。
- `date`:生成日期(ISO)。
- `latest`:是否为最新版。任意时刻恰有一条为 `true`。

数组按时间倒序(最新在前)。新增版本 = 往数组头部 push 一条 + 把原 `latest` 改为 `false`。

## 5. 版本目录命名规则

skill 在 Phase 0 锁定目标代码版本后,按以下规则推导目录名:

1. 若 `git describe --tags --exact-match HEAD` 成功 → 用该 tag,如 `v0.22.0/`。
2. 否则 → `<分支名>-<短SHA>`,如 `main-a1b2c3d/`。分支名取 `git rev-parse --abbrev-ref HEAD`。
3. 目录名中的 `/` 等非法字符替换为 `-`。
4. 若推导出的目录已存在(重复分析同一版本),skill 必须停下来问用户:**覆盖**该目录,还是**换一个目录名**。不得静默覆盖。

## 6. skill 工作流改动

skill 运行时先**探测输出目录**,进入三种模式之一:

| 探测到 | 模式 | 动作 |
|--------|------|------|
| 目录不存在 / 为空,且无 `versions.json` | 首次 | 按 v2 布局新建仓库 |
| 存在 `versions.json` | 追加 | 新增一个 `v<x>/` |
| 存在根级 `index.html` + `web/js/chapters.js`,但无 `versions.json` | 迁移 | 先迁移老 wiki 到 v2 结构,再走追加 |

### 6.1 Phase 0(收集输入)

- 首次模式:与现状一致。
- 追加 / 迁移模式:读出已有版本信息,向用户说明「已有版本 X、Y,本次将新增 Z」,只需收集新版本目标代码的路径与 ref;项目名、GitHub repo、输出目录、语言沿用已有设置。

### 6.2 Phase 4(web 设置)

整套输出——`index.html`、所有 `.md`、`web/` 目录——全部写进版本子目录 `v<x>/`,而不是仓库根。`web/js/chapters.js` 的 `ANALYZED_*` 常量照常按本次分析的版本填写,因此每个版本的 GitHub 深链天然指向正确 commit。

### 6.3 Phase 7(发布)

- **首次模式**:
  1. `git init -b main`
  2. 写顶层 `index.html`、`selector.css`、`README.md`、`LICENSE`、`.gitignore`
  3. 建首个版本目录 `v<x>/`(含完整 wiki)
  4. 写 `versions.json`(单条,`latest: true`)
  5. 提交,按用户确认推送,开启 GitHub Pages
- **追加模式**:
  1. 仓库已存在,新增 `v<x>/`
  2. 往 `versions.json` 头部 push 新条目,把原 `latest` 翻转为 `false`
  3. 顶层 `index.html` / `selector.css` 不改动
  4. 提交并推送
- **迁移模式**:见第 7 节,迁移完成后即按追加模式继续。

## 7. 迁移老版本 wiki

老 skill 生成的 wiki 是扁平单版本布局,没有 `versions.json`。新 skill 必须能识别并迁移,不得当成空目录或报错。

### 7.1 探测

输出目录根级同时存在 `index.html` 和 `web/js/chapters.js`,且不存在 `versions.json` → 判定为老版本 wiki。

### 7.2 迁移步骤(执行前必须先让用户确认)

迁移会 `git mv` 大量文件,属于结构性改动,skill 必须先向用户说明将把老 wiki 迁入哪个目录、并请求确认后才执行。

1. 读老 `web/js/chapters.js` 的 `ANALYZED_TAG`、`ANALYZED_COMMIT`、`ANALYZED_DATE`、`PROJECT_NAME`、`PROJECT_GITHUB_REPO`。老 skill 本来就写了这些字段,据此推导迁移后的目录名(规则同第 5 节,优先用 `ANALYZED_TAG`,为空则用 `ANALYZED_COMMIT`)。
2. `git mv` 把根级老 wiki 内容——`index.html`、所有 `.md`、`web/`——整体移入 `v<推导名>/`。`README.md`、`LICENSE`、`.gitignore`、`.git/` 留在根级。`git mv` 保留文件历史。
3. **给迁移过来的老版本查看器注入版本下拉**:
   - 把新的 `web/js/versions.js` 复制进 `v<推导名>/web/js/`。
   - 在该目录的 `index.html` 顶栏加入版本下拉占位元素。
   - 在该目录的 `web/js/app.js` 中加入对 `versions.js` 初始化的调用。
   - 仅改动导航 chrome,不触碰任何章节 `.md` 内容。
4. 顶层补上 `index.html`(选择页)、`selector.css`、`versions.json`(首条 = 迁移过来的老版本,`latest` 暂为 `true`)。
5. 迁移完成后转入追加模式,加入本次的新版本(新版本成为 `latest`,迁移版本翻转为 `false`)。

### 7.3 兼容性注意

- 迁移版本的 `web/js/` 是老 skill 当时的查看器代码;只新增 `versions.js` 文件并加一处初始化调用,改动最小、风险低。
- 迁移版本的 `chapters.js` 中 `STORAGE_PREFIX` 是老规则(仅基于 `PROJECT_NAME`)。第 8.3 节的版本隔离改动一并应用到迁移版本。

## 8. 查看器改动

每个版本目录的查看器仍然自包含。改动集中在版本下拉。

### 8.1 新增 `web/js/versions.js`

- fetch `../versions.json`。
- 在顶栏 brand 旁渲染版本下拉(`<select>`),当前版本高亮 / 选中。
- 选择其他版本 → 跳转到 `../<dir>/index.html`,即目标版本首页。
- **不做跨版本深链映射**:章节在不同版本可能增删,映射不可靠;统一落到目标版本首页最稳。
- `versions.json` fetch 失败(例如本地单目录打开)时,下拉静默隐藏,不影响查看器其余功能。

### 8.2 `index.html` 顶栏

在 `.brand` 旁加入版本下拉的占位元素(如 `<select id="version-switcher">`)。`templates/index.html` 模板同步更新。

### 8.3 localStorage 版本隔离

当前 `STORAGE_PREFIX` 仅由 `PROJECT_NAME` 派生。同源下(`owner.github.io/xxx-wiki`)多个版本的查看器会共享 localStorage。主题、源码链接模式共享是合理的,但阅读位置等状态会相互串扰。

改动:`STORAGE_PREFIX` 末尾追加版本目录名做隔离。这是 `chapters.js` 中的一行改动,迁移版本也一并应用。

### 8.4 顶层版本选择页

`templates/version-index.html` 是固定模板,运行时 fetch `versions.json`,以卡片列出所有版本:显示 `label`、`target_ref`、`commit`、`date`,`latest` 版本加徽章。点击卡片进入 `<dir>/index.html`。

因为页面内容完全由 `versions.json` 驱动,新增版本时**顶层 `index.html` 无需重新生成**。

## 9. 文件改动清单

### 改动现有文件

- `SKILL.md`:Phase 0(三态探测)、Phase 4(输出到 `v<x>/`)、Phase 7(版本化发布,首次 / 追加 / 迁移)。
- `templates/index.html`:顶栏加版本下拉占位。
- `templates/web/js/app.js`:初始化 `versions.js`。
- `templates/web/js/chapters.js`:`STORAGE_PREFIX` 追加版本目录名。
- `templates/readme.md.tmpl`:说明多版本布局与访问方式。
- `reference/workflow.md`:更新 Phase 7 流程,加入三态模式。

### 新增文件

- `templates/version-index.html`:顶层版本选择页模板。
- `templates/selector.css`:选择页样式。
- `templates/versions.json`:`versions.json` 的 schema 示例 / 模板。
- `templates/web/js/versions.js`:版本下拉模块。
- `reference/versioning.md`:版本化布局、命名规则、三态模式、迁移流程的完整参考说明。

## 10. 错误处理与边界情况

- **目录名冲突**:推导出的版本目录已存在 → 停下询问覆盖 / 换名,不静默覆盖。
- **`versions.json` 损坏 / 格式非法**:skill 应报错并请用户确认,不静默重建。
- **迁移确认**:迁移模式在 `git mv` 前必须取得用户确认。
- **查看器离线**:`versions.json` fetch 失败时下拉隐藏,查看器其余功能不受影响。
- **目标版本无 tag 且分支名含斜杠**(如 `feature/x`):斜杠替换为 `-` 后再拼短 SHA。
- **重复分析同一版本**:归入目录名冲突处理。

## 11. 验证

完成后需验证:

- 首次模式:空目录生成出 v2 布局,顶层选择页能列出唯一版本,进入后查看器正常。
- 追加模式:对已有 v2 wiki 再跑一次,新增版本目录,`versions.json` 正确更新,`latest` 正确翻转,旧版本仍可访问。
- 迁移模式:对一份老扁平 wiki 跑一次,老内容正确迁入版本目录且 git 历史保留,老版本查看器获得版本下拉,顶层文件正确生成。
- 版本下拉:在任一版本查看器内切换到另一版本,正确跳转到目标版本首页。
- localStorage:两个版本的阅读位置互不串扰。
