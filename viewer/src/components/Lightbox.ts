/**
 * Lightbox with wheel-zoom, drag-pan, double-click reset.
 *
 * - Click on `.markdown-body img` opens it
 * - Mouse wheel or pinch zooms (zoom range 1× – 8×)
 * - When zoomed > 1, drag to pan
 * - Double-click toggles between 1× and 2× centered on click
 * - Esc, X button, or click on dimmed backdrop closes
 */
export function installLightbox(): void {
  let overlay: HTMLElement | null = null;
  let img: HTMLImageElement | null = null;
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;

  const MIN_SCALE = 1;
  const MAX_SCALE = 8;

  const apply = () => {
    if (!img) return;
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    img.style.cursor = scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'default';
    const pctEl = overlay?.querySelector<HTMLElement>('.lightbox-zoom-pct');
    if (pctEl) pctEl.textContent = scale === 1 ? '' : `${Math.round(scale * 100)}%`;
  };

  const close = () => {
    if (overlay) {
      overlay.remove();
      overlay = null;
      img = null;
      document.body.style.overflow = '';
    }
  };

  const open = (sourceImg: HTMLImageElement) => {
    if (overlay) close();
    scale = 1;
    tx = 0;
    ty = 0;

    overlay = document.createElement('div');
    overlay.className = 'lightbox-overlay';
    overlay.innerHTML = `
      <button class="lightbox-close" type="button" aria-label="Close">×</button>
      <div class="lightbox-zoom-pct" aria-hidden="true"></div>
      <img class="lightbox-image" src="${sourceImg.src}" alt="${sourceImg.alt}">
    `;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    img = overlay.querySelector<HTMLImageElement>('.lightbox-image');
    apply();

    overlay.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('lightbox-image')) return;
      if (target.classList.contains('lightbox-close')) { close(); return; }
      if (target.classList.contains('lightbox-zoom-pct')) return;
      // Click on backdrop
      close();
    });

    // Wheel zoom — zoom around cursor position
    overlay.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (!img || !overlay) return;
      const rect = img.getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * factor));
      if (newScale === scale) return;
      // Adjust pan so the point under cursor stays put
      const ratio = newScale / scale;
      tx = (tx - cx) * ratio + cx;
      ty = (ty - cy) * ratio + cy;
      scale = newScale;
      if (scale === 1) { tx = 0; ty = 0; }
      apply();
    }, { passive: false });

    // Drag to pan (when zoomed in)
    img!.addEventListener('mousedown', (e) => {
      if (scale <= 1) return;
      dragging = true;
      dragStartX = e.clientX - tx;
      dragStartY = e.clientY - ty;
      apply();
      e.preventDefault();
    });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    // Double click toggles 1x ↔ 2x
    img!.addEventListener('dblclick', (e) => {
      if (!img) return;
      const rect = img.getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;
      if (scale === 1) {
        scale = 2;
        tx = -cx;
        ty = -cy;
      } else {
        scale = 1;
        tx = 0;
        ty = 0;
      }
      apply();
    });
  };

  function onMove(e: MouseEvent) {
    if (!dragging) return;
    tx = e.clientX - dragStartX;
    ty = e.clientY - dragStartY;
    apply();
  }
  function onUp() {
    if (dragging) {
      dragging = false;
      apply();
    }
  }

  document.addEventListener('click', (e) => {
    const target = e.target as Element | null;
    if (!target) return;
    const candidate = target.closest<HTMLImageElement>('.markdown-body img');
    if (!candidate) return;
    if ((e as MouseEvent).metaKey || (e as MouseEvent).ctrlKey || (e as MouseEvent).shiftKey) return;
    e.preventDefault();
    open(candidate);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay) close();
  });
}
