type Child = Node | string | number | false | null | undefined;
type Props = Record<string, unknown> & {
  class?: string;
  style?: string;
  onclick?: (e: MouseEvent) => void;
  onsubmit?: (e: SubmitEvent) => void;
  oninput?: (e: InputEvent) => void;
  onchange?: (e: Event) => void;
};

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'style') el.setAttribute('style', String(v));
      else if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2), v as EventListener);
      } else if (k === 'html') {
        el.innerHTML = String(v);  // CAUTION — only for trusted (e.g., marked() output we trust)
      } else {
        el.setAttribute(k, String(v));
      }
    }
  }
  for (const c of children) {
    if (c === false || c === null || c === undefined) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return el;
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function mount(root: HTMLElement, node: Node): void {
  clear(root);
  root.appendChild(node);
}
