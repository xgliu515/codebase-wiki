import { Marked, type Tokens } from 'marked';
import type { Manifest } from '@codebase-wiki/shared';
import { h } from '../dom.js';
import { slugifyHeading } from '../util/anchors.js';

export type RenderContext = {
  subject: string;
  version: string;
  manifest: Manifest;
};

export function renderMarkdown(md: string, ctx: RenderContext): HTMLElement {
  // Create a fresh Marked instance per call to avoid global state pollution
  // (marked v14: use() / renderer methods use object-destructured tokens)
  const instance = new Marked({
    gfm: true,
    breaks: false,
    renderer: {
      // marked v14: image receives { href, title, text } as object
      image({ href, title, text }: Tokens.Image): string {
        // Rewrite relative figure paths into API URLs
        if (href && !/^https?:\/\//.test(href) && !href.startsWith('/api/')) {
          const fig = ctx.manifest.figures.find((f) => f.path === href);
          if (fig) {
            href = `/api/v1/wikis/${ctx.subject}/${ctx.version}/figures/${fig.id}`;
          }
          // else: leave href as-is (unusual relative path)
        }
        const safe = (text ?? '').replace(/"/g, '&quot;');
        const titleAttr = title ? ` title="${title.replace(/"/g, '&quot;')}"` : '';
        return `<img src="${href}" alt="${safe}"${titleAttr} loading="lazy">`;
      },

      // marked v14: heading receives { tokens, depth } as object
      // token.text holds the plain-text heading content (used for slug)
      // this.parser.parseInline(tokens) renders inline markdown (bold, code, etc.)
      heading({ tokens, depth, text }: Tokens.Heading): string {
        const id = slugifyHeading(text);
        const inner = this.parser.parseInline(tokens);
        return `<h${depth} id="${id}">${inner}</h${depth}>\n`;
      },
    },
  });

  const html = instance.parse(md) as string;
  return h('div', { class: 'markdown-body', html });
}
