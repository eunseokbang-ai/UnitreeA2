import * as dashboard from './dashboard.js';
import * as students from './students.js';
import * as attendance from './attendance.js';
import * as tuition from './tuition.js';
import * as progress from './progress.js';
import * as settings from './settings.js';

const TABS = [
  { id: 'dashboard', label: '홈', icon: '🏠', mod: dashboard },
  { id: 'attendance', label: '출석', icon: '✅', mod: attendance },
  { id: 'students', label: '원생', icon: '👤', mod: students },
  { id: 'tuition', label: '원비', icon: '💰', mod: tuition },
  { id: 'progress', label: '진도', icon: '📈', mod: progress },
  { id: 'settings', label: '설정', icon: '⚙️', mod: settings },
];

let containerEl = null;
let navEl = null;
let current = null;

export function initRouter(container, nav) {
  containerEl = container;
  navEl = nav;
  navEl.innerHTML = TABS.map(
    (t) => `<button class="nav-btn" data-tab="${t.id}"><span class="nav-icon">${t.icon}</span><span class="nav-label">${t.label}</span></button>`
  ).join('');
  navEl.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => goTab(btn.dataset.tab));
  });
  goTab('dashboard');
}

export async function goTab(id) {
  const tab = TABS.find((t) => t.id === id);
  if (!tab || !containerEl) return;
  if (current && current.mod.unmount) {
    try { current.mod.unmount(); } catch { /* ignore */ }
  }
  current = tab;
  navEl.querySelectorAll('.nav-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === id));
  containerEl.scrollTop = 0;
  await tab.mod.render(containerEl);
}

export function refreshCurrent() {
  if (current) current.mod.render(containerEl);
}
