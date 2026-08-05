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
  // 새 버전이 배포되어 서비스워커가 교체되면, 열려있던 화면도 자동으로 새로고침해서
  // 최신 화면(레이아웃 수정 등)이 바로 반영되도록 합니다.
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
}
