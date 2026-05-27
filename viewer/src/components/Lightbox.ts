/**
 * Single global lightbox: any click on an <img> inside `.markdown-body` opens
 * a fullscreen overlay with the image. Close on click-outside, Esc, or X button.
 *
 * Installed once at app startup via `installLightbox()`. Uses a delegated
 * document-level click listener so it works across re-paints automatically.
 */
export function installLightbox(): void {
  let overlay: HTMLElement | null = null;

  const close = () => {
    if (overlay) {
      overlay.remove();
      overlay = null;
      document.body.style.overflow = '';
    }
  };

  const open = (img: HTMLImageElement) => {
    if (overlay) close();
    overlay = document.createElement('div');
    overlay.className = 'lightbox-overlay';
    overlay.innerHTML = `
      <button class="lightbox-close" type="button" aria-label="Close">×</button>
      <img class="lightbox-image" src="${img.src}" alt="${img.alt}">
    `;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    overlay.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      // Click on the image itself doesn't close — only backdrop / close button
      if (target.classList.contains('lightbox-image')) return;
      close();
    });
  };

  document.addEventListener('click', (e) => {
    const target = e.target as Element | null;
    if (!target) return;
    const img = target.closest<HTMLImageElement>('.markdown-body img');
    if (!img) return;
    // Skip if the user is intentionally opening in a new tab
    if ((e as MouseEvent).metaKey || (e as MouseEvent).ctrlKey || (e as MouseEvent).shiftKey) return;
    e.preventDefault();
    open(img);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay) close();
  });
}
