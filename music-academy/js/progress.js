import { DB } from './db.js';
import { escapeHtml, todayStr, debounce, toast } from './utils.js';
import { openModal, closeModal } from './modal.js';
import { appState } from './state.js';
import { AVATAR_PLACEHOLDER } from './students.js';

let query = '';

export async function render(root) {
  root.innerHTML = `
    <div class="view-header">
      <h2>진도 관리</h2>
    </div>
    <div id="progress-body"></div>
  `;
  const bodyEl = root.querySelector('#progress-body');

  if (appState.selectedStudentId) {
    const student = await DB.get('students', appState.selectedStudentId);
    appState.selectedStudentId = null;
    if (student) {
      await renderStudentPanel(bodyEl, student);
      return;
    }
  }
  await renderPicker(bodyEl);
}

async function renderPicker(bodyEl) {
  const students = (await DB.getAll('students')).sort((a, b) =>
    (a.studentNo || '').localeCompare(b.studentNo || '', 'ko', { numeric: true })
  );
  bodyEl.innerHTML = `
    <input type="search" id="progress-search" class="search-input" placeholder="학생 검색" value="${escapeHtml(query)}" />
    <div id="progress-picker-list" class="student-grid"></div>
  `;
  const listEl = bodyEl.querySelector('#progress-picker-list');

  function draw() {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? students.filter((s) => [s.name, s.studentNo, s.school].filter(Boolean).some((f) => String(f).toLowerCase().includes(q)))
      : students;
    if (filtered.length === 0) {
      listEl.innerHTML = `<p class="empty-msg">원생이 없습니다.</p>`;
      return;
    }
    listEl.innerHTML = filtered
      .map(
        (s) => `
        <div class="student-card" data-id="${s.id}">
          <img class="avatar" src="${s.photo || AVATAR_PLACEHOLDER}" />
          <div class="student-card-info">
            <div class="student-card-name">${escapeHtml(s.name)} <span class="student-no">#${escapeHtml(s.studentNo)}</span></div>
            <div class="student-card-sub">${escapeHtml(s.school || '')} ${escapeHtml(s.grade || '')}</div>
          </div>
        </div>`
      )
      .join('');
    listEl.querySelectorAll('.student-card').forEach((card) => {
      card.addEventListener('click', async () => {
        const student = await DB.get('students', Number(card.dataset.id));
        renderStudentPanel(bodyEl, student);
      });
    });
  }
  draw();

  bodyEl.querySelector('#progress-search').addEventListener(
    'input',
    debounce((e) => {
      query = e.target.value;
      draw();
    }, 150)
  );
}

async function renderStudentPanel(bodyEl, student) {
  const records = (await DB.getAllByIndex('progress', 'studentId', student.id)).sort(
    (a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id
  );

  bodyEl.innerHTML = `
    <div class="panel-header">
      <button class="btn btn-sm" id="back-btn">◀ 다른 학생 선택</button>
    </div>
    <div class="student-summary">
      <img class="avatar" src="${student.photo || AVATAR_PLACEHOLDER}" />
      <div>
        <div class="confirm-name">${escapeHtml(student.name)} <span class="student-no">#${escapeHtml(student.studentNo)}</span></div>
        <div>${escapeHtml(student.school || '')} ${escapeHtml(student.grade || '')}</div>
      </div>
      <button class="btn btn-primary" id="add-progress">+ 새 기록</button>
    </div>
    <div id="progress-history" class="progress-history"></div>
  `;

  bodyEl.querySelector('#back-btn').addEventListener('click', () => renderPicker(bodyEl));
  bodyEl.querySelector('#add-progress').addEventListener('click', () => openProgressForm(bodyEl, student));

  const historyEl = bodyEl.querySelector('#progress-history');
  if (records.length === 0) {
    historyEl.innerHTML = `<p class="empty-msg">기록된 진도가 없습니다.</p>`;
    return;
  }
  historyEl.innerHTML = records
    .map(
      (r) => `
      <div class="progress-item" data-id="${r.id}">
        <div class="progress-item-date">${escapeHtml(r.date)}</div>
        <div class="progress-item-content">${escapeHtml(r.content)}</div>
        ${r.memo ? `<div class="progress-item-memo">${escapeHtml(r.memo)}</div>` : ''}
        <button class="icon-btn progress-delete" title="삭제">✕</button>
      </div>`
    )
    .join('');
  historyEl.querySelectorAll('.progress-delete').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = Number(e.target.closest('.progress-item').dataset.id);
      if (!confirm('이 기록을 삭제할까요?')) return;
      await DB.delete('progress', id);
      renderStudentPanel(bodyEl, student);
    });
  });
}

function openProgressForm(bodyEl, student) {
  openModal(
    `
    <div class="modal-header">
      <h3>${escapeHtml(student.name)} 진도 기록 추가</h3>
      <button class="icon-btn" id="modal-close">✕</button>
    </div>
    <form id="progress-form" class="form-grid">
      <label>날짜<input type="date" id="pr-date" value="${todayStr()}" required /></label>
      <label>진도 내용<input id="pr-content" placeholder="예: 바이엘 32번, 체르니100 5번" required /></label>
      <label class="span-2">메모<textarea id="pr-memo"></textarea></label>
      <div class="modal-footer span-2">
        <span></span>
        <button type="submit" class="btn btn-primary">저장</button>
      </div>
    </form>
  `,
    {
      onMount: (el) => {
        el.querySelector('#modal-close').addEventListener('click', closeModal);
        el.querySelector('#progress-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const content = el.querySelector('#pr-content').value.trim();
          if (!content) return;
          await DB.add('progress', {
            studentId: student.id,
            date: el.querySelector('#pr-date').value,
            content,
            memo: el.querySelector('#pr-memo').value.trim(),
          });
          closeModal();
          toast('진도 기록이 저장되었습니다.');
          renderStudentPanel(bodyEl, student);
        });
      },
    }
  );
}
