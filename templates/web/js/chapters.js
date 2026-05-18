// 章节元数据。id 即文件 basename，title/desc 用于侧栏和首页卡片。
//
// ============================================================
// REPLACE EVERYTHING IN THIS FILE WITH PROJECT-SPECIFIC DATA
// ============================================================
// The placeholders below show the structure used by vllm-wiki.
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

// 所有文档（章节 + tour），用于路由查找和搜索
export const ALL_DOCS = [...CHAPTERS, ...TOURS];
export const CHAPTER_BY_ID = Object.fromEntries(ALL_DOCS.map(c => [c.id, c]));

// =========================================================
// 分析的代码版本（升级版本时改这 4 个常量即可，所有 GitHub 跳转链接都会更新）
// =========================================================
export const PROJECT_GITHUB_REPO = '{{OWNER}}/{{PROJECT}}';   // e.g. 'vllm-project/vllm'
export const ANALYZED_COMMIT = '{{COMMIT_SHORT}}';            // e.g. '086749736'
export const ANALYZED_TAG = '{{TAG_OR_DESCRIBE}}';            // e.g. 'v0.21.1rc0+35'
export const ANALYZED_DATE = '{{DATE_ISO}}';                  // e.g. '2026-05-17'

// 旧名兼容（部分早期文件仍引用这两个名字）
export const VLLM_GITHUB_REPO = PROJECT_GITHUB_REPO;
export const VLLM_ANALYZED_COMMIT = ANALYZED_COMMIT;
export const VLLM_ANALYZED_TAG = ANALYZED_TAG;
export const VLLM_ANALYZED_DATE = ANALYZED_DATE;

// =========================================================
// file:line 跳转链接：默认走 GitHub（任何人可用），可切换成本地 VSCode
// localStorage 里有 path → 'local' 模式；没有 → 'github' 模式
// =========================================================
const REPO_ROOT_KEY = '{{PROJECT}}-wiki-repo-root';

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

// 旧名兼容
export const VLLM_REPO_ROOT = '';
