// 章节元数据。id 即文件 basename，title/desc 用于侧栏和首页卡片。
//
// ============================================================
// REPLACE EVERYTHING IN THIS FILE WITH PROJECT-SPECIFIC DATA
// ============================================================
// The placeholders below show the structure expected by the web viewer.
// Edit CHAPTERS / TOURS arrays to match your generated content.

export const CHAPTERS = [
  // Example structure — replace with your real chapters
  { id: '01-architecture-overview',  num: '01', title: '架构总览',
    desc: '一句话概括本章在讲什么',
    layers: [1, 2, 3, 4] },
  { id: '02-...',                    num: '02', title: '...',
    desc: '...',
    layers: [] },
  // ... add 10-15 entries
  // 可选 addenda 字段（由 Q&A flow 自动维护，手工不需要写）:
  // { id: '03-scheduler', num: '03', title: 'Scheduler', desc: '...', layers: [2],
  //   addenda: [
  //     { id: '03a-fork-join-strategy',
  //       title: 'Fork-join 调度策略',
  //       question: '当请求被拆成多片并行调度时,合并阶段怎么处理?',
  //       asked_at: '2026-05-21',          // ISO date, 与 git 时间戳脱钩
  //       classification: 'matched' },     // 'matched' | 'fallback'
  //   ]
  // },
  { id: '12-glossary-and-faq',       num: '12', title: '术语表与 FAQ',
    desc: '术语、FAQ、环境变量、命令速查',
    layers: [] },
];

// 单请求 trace 导览：tour-00 是 overview + tour-01..N 是步骤
export const TOURS = [
  { id: 'tour-00-overview',          num: '00', title: '导览总览',
    desc: '完整 trace 入口、8 段模板说明、N 步速览' },
  // ... add 15-20 step entries
];

export const TOUR_BY_ID = Object.fromEntries(TOURS.map(t => [t.id, t]));

// 所有文档（章节 + addenda + tour），用于路由查找和搜索。
// addenda 被平铺进 ALL_DOCS，每个 addendum 项额外带 parentId，便于内容渲染时回链。
const FLATTENED_CHAPTERS = CHAPTERS.flatMap(c => {
  const entries = [c];
  if (Array.isArray(c.addenda)) {
    for (const a of c.addenda) {
      entries.push({ ...a, parentId: c.id, num: a.id.match(/^(\d+[a-z]?)/)?.[1] ?? c.num });
    }
  }
  return entries;
});
export const ALL_DOCS = [...FLATTENED_CHAPTERS, ...TOURS];
export const CHAPTER_BY_ID = Object.fromEntries(ALL_DOCS.map(c => [c.id, c]));

// =========================================================
// 项目信息 —— 本文件是整个 web 查看器唯一需要按项目修改的 JS 文件。
// 其它 web/js/*.js 都从这里 import 这些常量，请勿在别处写死项目名。
// =========================================================
export const PROJECT_NAME = '{{PROJECT_NAME}}';   // 友好名，用于标题/首页，e.g. 'vLLM'

// 分析的代码版本（升级版本时改这 4 个常量即可，所有 GitHub 跳转链接都会更新）
export const PROJECT_GITHUB_REPO = '{{OWNER}}/{{PROJECT}}';   // e.g. 'vllm-project/vllm'
export const ANALYZED_COMMIT = '{{COMMIT_SHORT}}';            // e.g. '086749736'
export const ANALYZED_TAG = '{{TAG_OR_DESCRIBE}}';            // e.g. 'v0.21.1rc0+35'
export const ANALYZED_DATE = '{{DATE_ISO}}';                  // e.g. '2026-05-17'

// 首页文案
export const PROJECT_TAGLINE = '{{PROJECT_TAGLINE}}';  // 首页副标题，一句话，e.g. '为深入学习 vLLM 源码而写的可查询参考文档。'
export const PROJECT_FOCUS = '{{PROJECT_FOCUS}}';      // 聚焦范围，e.g. 'V1 架构'；留空字符串则首页不显示这一项
export const TRACE_TARGET = '{{TRACE_TARGET}}';        // trace 导览跟踪的最简请求，e.g. 'llm.generate(["你好"], max_tokens=3)'

// =========================================================
// ⚠️ DO NOT REMOVE OR REWRITE BELOW THIS LINE
// The viewer's other JS files (utils.js / app.js / sidebar.js / glossary.js etc.)
// import these helpers. If you delete or alter them the viewer breaks at module load
// with `does not provide an export named 'getRepoMode'`-style errors.
// Only the constants ABOVE this banner need per-project edits.
// =========================================================

// 当前版本目录名：取 URL 路径里最后一个非 .html 段，例如
//   /xxx-wiki/v0.22.0/index.html  →  'v0.22.0'
// 用于版本切换下拉与 localStorage 隔离。返回 URL 路径的最后一段，路径为空时返回空串。
export function getCurrentVersionDir() {
  const segs = location.pathname.split('/').filter(Boolean);
  if (segs.length && /\.html?$/i.test(segs[segs.length - 1])) segs.pop();
  return segs.length ? segs[segs.length - 1] : '';
}

// 当前项目目录名：mono-repo 下版本目录的上一级，例如
//   /wikis/vllm/v0.22.0/index.html  →  'vllm'
// 用于项目切换下拉。路径不足两段时返回空串。
export function getCurrentProjectDir() {
  const segs = location.pathname.split('/').filter(Boolean);
  if (segs.length && /\.html?$/i.test(segs[segs.length - 1])) segs.pop();
  return segs.length >= 2 ? segs[segs.length - 2] : '';
}

// localStorage key 前缀：由 PROJECT_NAME 派生，并追加版本目录名做隔离，
// 避免同源下多个版本的查看器互相覆盖阅读状态。
export const STORAGE_PREFIX = (() => {
  const base = (PROJECT_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'codebase') + '-wiki';
  const ver = getCurrentVersionDir();
  return ver ? `${base}-${ver}` : base;
})();

// =========================================================
// file:line 跳转链接：默认走 GitHub（任何人可用），可切换成本地 VSCode
// localStorage 里有 path → 'local' 模式；没有 → 'github' 模式
// =========================================================
const REPO_ROOT_KEY = STORAGE_PREFIX + '-repo-root';

export function getRepoMode() {
  return getRepoRoot() ? 'local' : 'github';
}

export function getRepoRoot() {
  try { return localStorage.getItem(REPO_ROOT_KEY) || ''; }
  catch { return ''; }
}

export function setRepoRoot(path) {
  try {
    if (path && path.trim()) localStorage.setItem(REPO_ROOT_KEY, path.trim());
    else localStorage.removeItem(REPO_ROOT_KEY);
  } catch {}
}
