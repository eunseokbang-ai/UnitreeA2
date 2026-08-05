import { DB } from './db.js';
import { initRouter } from './router.js';
import { appState, DEFAULT_ACADEMY_NAME } from './state.js';
import { setHeaderTitle } from './utils.js';

async function init() {
  const nameRec = await DB.get('settings', 'academyName');
  appState.academyName = nameRec?.value || DEFAULT_ACADEMY_NAME;
  setHeaderTitle(appState.academyName);

  const container = document.getElementById('app-content');
  const nav = document.getElementById('bottom-nav');
  initRouter(container, nav);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW 등록 실패', err));
  });
}
