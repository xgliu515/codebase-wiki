import { Marked, type Tokens } from 'marked';
import hljs from 'highlight.js/lib/common';
import type { Manifest } from '@codebase-wiki/shared';
import { h } from '../dom.js';
import { slugifyHeading } from '../util/anchors.js';

export type RenderContext = {
  subject: string;
  version: string;
  manifest: Manifest;
};

// Matches `path/file.ext:LINE` and `path/file.ext:LINE-LINE`.
// Path must contain at least one `/` to avoid matching prose like "version:123".
// Extension must be 1-6 alphanumeric chars.
const FILE_REF_RE = /(?<![\w/.-])((?:[\w.-]+\/)+[\w.-]+\.[A-Za-z0-9]{1,6}):(\d+(?:-\d+)?)/g;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function applyDeepLinkTemplate(template: string, commit: string, path: string, line: string): string {
  // `line` may be "123" or "123-456"; deep_link_template uses {line} singular.
  // For ranges we link the first line; the range is preserved as anchor text.
  const firstLine = line.split('-')[0]!;
  return template
    .replace('{commit}', commit)
    .replace('{path}', path)
    .replace('{line}', firstLine);
}

/**
 * After marked renders to HTML, post-process to wrap file:line references in
 * GitHub deep links. Only operates inside <p>, <li>, and text nodes — never
 * inside <pre>/<code> blocks (which would corrupt code samples).
 */
function linkifyFileRefs(html: string, ctx: RenderContext): string {
  if (ctx.manifest.source.type !== 'codebase') return html;
  const { target_commit, deep_link_template } = ctx.manifest.source.codebase;
  if (!deep_link_template) return html;

  // Split on code/pre blocks so we don't touch their innards.
  const parts = html.split(/(<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>)/);
  return parts
    .map((part) => {
      if (part.startsWith('<pre') || part.startsWith('<code')) return part;
      return part.replace(FILE_REF_RE, (_match, path: string, line: string) => {
        const url = applyDeepLinkTemplate(deep_link_template, target_commit, path, line);
        return `<a class="file-ref" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(path)}:${escapeHtml(line)}</a>`;
      });
    })
    .join('');
}

export function renderMarkdown(md: string, ctx: RenderContext): HTMLElement {
  const instance = new Marked({
    gfm: true,
    breaks: false,
    renderer: {
      image({ href, title, text }: Tokens.Image): string {
        if (href && !/^https?:\/\//.test(href) && !href.startsWith('/api/')) {
          const fig = ctx.manifest.figures.find((f) => f.path === href);
          if (fig) {
            href = `/api/v1/wikis/${ctx.subject}/${ctx.version}/figures/${fig.id}`;
          }
        }
        const safe = (text ?? '').replace(/"/g, '&quot;');
        const titleAttr = title ? ` title="${title.replace(/"/g, '&quot;')}"` : '';
        return `<img src="${href}" alt="${safe}"${titleAttr} loading="lazy">`;
      },

      heading({ tokens, depth, text }: Tokens.Heading): string {
        const id = slugifyHeading(text);
        const inner = this.parser.parseInline(tokens);
        const anchor = `<a class="heading-anchor" href="#${id}" aria-label="permalink" tabindex="-1">#</a>`;
        return `<h${depth} id="${id}">${inner}${anchor}</h${depth}>\n`;
      },

      code({ text, lang }: Tokens.Code): string {
        const language = (lang ?? '').trim().toLowerCase().split(/\s+/)[0] ?? '';
        let highlighted: string;
        let langClass = '';
        let langLabel = '';
        if (language && hljs.getLanguage(language)) {
          highlighted = hljs.highlight(text, { language, ignoreIllegals: true }).value;
          langClass = ` language-${language} hljs`;
          langLabel = language;
        } else if (text.length < 5000) {
          // Auto-detect on short blocks only (perf guard)
          const result = hljs.highlightAuto(text);
          highlighted = result.value;
          langClass = ' hljs';
          langLabel = result.language ?? '';
        } else {
          highlighted = escapeHtml(text);
        }
        const labelHtml = langLabel
          ? `<span class="code-lang">${escapeHtml(langLabel)}</span>`
          : '';
        return `<div class="code-block">${labelHtml}<button class="code-copy" type="button" aria-label="Copy code">Copy</button><pre><code class="${langClass.trim()}">${highlighted}</code></pre></div>\n`;
      },
    },
  });

  let html = instance.parse(md) as string;
  html = linkifyFileRefs(html, ctx);

  const el = h('div', { class: 'markdown-body', html });
  attachCopyHandlers(el);
  return el;
}

function attachCopyHandlers(root: HTMLElement): void {
  root.querySelectorAll<HTMLButtonElement>('button.code-copy').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const codeEl = btn.parentElement?.querySelector('code');
      if (!codeEl) return;
      try {
        await navigator.clipboard.writeText(codeEl.textContent ?? '');
        const original = btn.textContent;
        btn.textContent = 'Copied';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = original;
          btn.classList.remove('copied');
        }, 1500);
      } catch {
        btn.textContent = 'Failed';
        setTimeout(() => (btn.textContent = 'Copy'), 1500);
      }
    });
  });
}
