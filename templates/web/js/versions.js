import { getCurrentVersionDir } from './chapters.js';

// =========================================================
// 版本切换下拉
// 运行时 fetch 顶层 ../versions.json，在顶栏渲染版本下拉。
// 切换版本 = 跳到目标版本首页（不做跨版本深链映射）。
// fetch 失败（如本地单目录打开、非版本化布局）时静默隐藏下拉。
// =========================================================

export async function initVersionSwitcher() {
  const sel = document.getElementById('version-switcher');
  if (!sel) return;

  let manifest;
  try {
    const resp = await fetch('../versions.json', { cache: 'no-cache' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    manifest = await resp.json();
  } catch {
    sel.hidden = true;
    return;
  }

  const versions = Array.isArray(manifest && manifest.versions) ? manifest.versions : [];
  if (versions.length < 1) {
    sel.hidden = true;
    return;
  }

  const current = getCurrentVersionDir();
  sel.innerHTML = '';
  for (const v of versions) {
    const opt = document.createElement('option');
    opt.value = v.dir;
    opt.textContent = (v.label || v.dir) + (v.latest ? '  (latest)' : '');
    if (v.dir === current) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.hidden = false;

  sel.addEventListener('change', () => {
    const dir = sel.value;
    if (dir && dir !== current) {
      location.href = `../${dir}/index.html`;
    }
  });
}
