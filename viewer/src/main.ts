const app = document.querySelector('#app');
if (app) {
  app.textContent = 'viewer scaffold loaded';
}
console.log('viewer build:', (window as any).__INITIAL__);
