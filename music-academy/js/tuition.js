import { DB } from './db.js';
import { escapeHtml, todayStr, yearMonthStr, tuitionDueDateThisMonth, daysUntil, toast } from './utils.js';
import { openModal, closeModal } from './modal.js';
import { appState } from './state.js';
import { AVATAR_PLACEHOLDER } from './students.js';

let viewDate = new Date();
let hideOnlyUnpaid = false;

export async function getReminderDays() {
  const rec = await DB.get('settings', 'reminderDays');
  return rec ? Number(rec.value) : 3;
}

// 대시보드에서도 재사용: 오늘 기준 임박/연체 목록
export async function getTuitionAlerts() {
  const reminderDays = await getReminderDays();
  const students = (await DB.getAll('students')).filter((s) => s.active !== false && s.tuitionDay);
  const ym = yearMonthStr();
  const payments = await DB.getAll('payments');
  const paidSet = new Set(payments.filter((p) => p.yearMonth === ym).map((p) => p.studentId));

  const upcoming = [];
  const overdue = [];
  for (const s of students) {
    if (paidSet.has(s.id)) continue;
    const due = tuitionDueDateThisMonth(s.tuitionDay);
    const diff = daysUntil(due);
    if (diff < 0) overdue.push({ student: s, due, diff });
    else if (diff <= reminderDays) upcoming.push({ student: s, due, diff });
  }
  upcoming.sort((a, b) => a.diff - b.diff);
  overdue.sort((a, b) => a.diff - b.diff);
  return { upcoming, overdue };
}

export async function render(root) {
  viewDate = new Date();
  const ym = yearMonthStr(viewDate);
  root.innerHTML = `
    <div class="view-header">
      <h2>원비 관리</h2>
    </div>
    <div class="month-nav">
      <button class="btn btn-sm" id="prev-month">◀</button>
      <div id="month-label" class="month-label"></div>
      <button class="btn btn-sm" id="next-month">▶</button>
      <label class="checkbox-row inline"><input type="checkbox" id="filter-unpaid" ${hideOnlyUnpaid ? 'checked' : ''}/> 미납만 보기</label>
    </div>
    <div id="alert-banner"></div>
    <div id="tuition-list" class="tuition-list"></div>
  `;

  root.querySelector('#prev-month').addEventListener('click', () => {
    viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
    refresh(root);
  });
  root.querySelector('#next-month').addEventListener('click', () => {
    viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
    refresh(root);
  });
  root.querySelector('#filter-unpaid').addEventListener('change', (e) => {
    hideOnlyUnpaid = e.target.checked;
    refresh(root);
  });

  await refresh(root);
}

async function refresh(root) {
  root.querySelector('#month-label').textContent = `${viewDate.getFullYear()}년 ${viewDate.getMonth() + 1}월`;
  const ym = yearMonthStr(viewDate);
  const isCurrentMonth = ym === yearMonthStr(new Date());

  const { upcoming, overdue } = isCurrentMonth ? await getTuitionAlerts() : { upcoming: [], overdue: [] };
  const banner = root.querySelector('#alert-banner');
  if (upcoming.length || overdue.length) {
    banner.innerHTML = `
      <div class="alert-box">
        ${overdue.length ? `<div class="alert-line alert-danger">연체 ${overdue.length}명: ${overdue.map((o) => escapeHtml(o.student.name)).join(', ')}</div>` : ''}
        ${upcoming.length ? `<div class="alert-line alert-warn">납부 임박 ${upcoming.length}명: ${upcoming.map((o) => escapeHtml(o.student.name)).join(', ')}</div>` : ''}
      </div>`;
  } else {
    banner.innerHTML = '';
  }

  const students = (await DB.getAll('students')).filter((s) => s.active !== false);
  const payments = await DB.getAll('payments');
  const paymentMap = new Map(payments.filter((p) => p.yearMonth === ym).map((p) => [p.studentId, p]));

  students.sort((a, b) => (a.tuitionDay || 99) - (b.tuitionDay || 99));

  const rows = students
    .map((s) => {
      const payment = paymentMap.get(s.id);
      const due = s.tuitionDay ? tuitionDueDateThisMonth(s.tuitionDay, viewDate) : null;
      const diff = due ? daysUntil(due) : null;
      let statusHtml;
      if (payment) statusHtml = `<span class="pill pill-green">완납</span>`;
      else if (!due) statusHtml = `<span class="pill">납부일 미설정</span>`;
      else if (diff < 0) statusHtml = `<span class="pill pill-red">${Math.abs(diff)}일 연체</span>`;
      else if (diff === 0) statusHtml = `<span class="pill pill-orange">오늘 납부일</span>`;
      else statusHtml = `<span class="pill">D-${diff}</span>`;
      return { s, payment, due, paid: !!payment, statusHtml };
    })
    .filter((r) => (hideOnlyUnpaid ? !r.paid : true));

  const listEl = root.querySelector('#tuition-list');
  if (rows.length === 0) {
    listEl.innerHTML = `<p class="empty-msg">표시할 원생이 없습니다.</p>`;
    return;
  }
  listEl.innerHTML = rows
    .map(
      ({ s, payment, due, statusHtml }) => `
      <div class="tuition-row" data-id="${s.id}">
        <img class="avatar avatar-sm" src="${s.photo || AVATAR_PLACEHOLDER}" />
        <div class="tuition-row-info">
          <div><b>${escapeHtml(s.name)}</b> <span class="student-no">#${escapeHtml(s.studentNo)}</span></div>
          <div class="tuition-row-sub">납부일: 매월 ${s.tuitionDay || '-'}일${due ? ` (${due.getMonth() + 1}/${due.getDate()})` : ''} ${s.tuitionAmount ? `· ${Number(s.tuitionAmount).toLocaleString()}원` : ''}</div>
          ${payment ? `<div class="tuition-row-sub">납부: ${payment.paidDate} · ${Number(payment.amount || 0).toLocaleString()}원</div>` : ''}
        </div>
        <div class="tuition-row-actions">
          ${statusHtml}
          <button class="btn btn-sm ${payment ? '' : 'btn-primary'}" data-action="${payment ? 'unpay' : 'pay'}">${payment ? '취소' : '완납처리'}</button>
        </div>
      </div>`
    )
    .join('');

  listEl.querySelectorAll('[data-action="pay"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = Number(e.target.closest('.tuition-row').dataset.id);
      const student = students.find((s) => s.id === id);
      openPaymentModal(root, student, ym);
    });
  });
  listEl.querySelectorAll('[data-action="unpay"]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = Number(e.target.closest('.tuition-row').dataset.id);
      const payment = paymentMap.get(id);
      if (!payment) return;
      if (!confirm('완납 처리를 취소할까요?')) return;
      await DB.delete('payments', payment.id);
      toast('완납 처리를 취소했습니다.');
      refresh(root);
    });
  });

  if (appState.selectedStudentId) {
    const rowEl = listEl.querySelector(`[data-id="${appState.selectedStudentId}"]`);
    if (rowEl) {
      rowEl.classList.add('highlight');
      rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    appState.selectedStudentId = null;
  }
}

function openPaymentModal(root, student, ym) {
  openModal(
    `
    <div class="modal-header">
      <h3>${escapeHtml(student.name)} 원비 완납 처리</h3>
      <button class="icon-btn" id="modal-close">✕</button>
    </div>
    <form id="pay-form" class="form-grid">
      <label>납부일자<input type="date" id="p-date" value="${todayStr()}" required /></label>
      <label>금액<input type="number" id="p-amount" value="${student.tuitionAmount || ''}" /></label>
      <label class="span-2">메모<input id="p-memo" /></label>
      <div class="modal-footer span-2">
        <span></span>
        <button type="submit" class="btn btn-primary">저장</button>
      </div>
    </form>
  `,
    {
      onMount: (el) => {
        el.querySelector('#modal-close').addEventListener('click', closeModal);
        el.querySelector('#pay-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const existing = await DB.getByIndex('payments', 'studentId_month', [student.id, ym]);
          const payload = {
            studentId: student.id,
            yearMonth: ym,
            paidDate: el.querySelector('#p-date').value,
            amount: Number(el.querySelector('#p-amount').value) || 0,
            memo: el.querySelector('#p-memo').value.trim(),
          };
          if (existing) await DB.put('payments', { ...existing, ...payload });
          else await DB.add('payments', payload);
          closeModal();
          toast('완납 처리되었습니다.');
          refresh(root);
        });
      },
    }
  );
}
