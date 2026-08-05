import { DB } from './db.js';
import { escapeHtml, formatDateKr, todayStr, timeStr } from './utils.js';
import { getTuitionAlerts } from './tuition.js';
import { goTab } from './router.js';
import { AVATAR_PLACEHOLDER } from './students.js';

export async function render(root) {
  const [students, todayAttendance, alerts] = await Promise.all([
    DB.getAll('students'),
    DB.getAllByIndex('attendance', 'date', todayStr()),
    getTuitionAlerts(),
  ]);
  const activeStudents = students.filter((s) => s.active !== false);
  const studentMap = new Map(students.map((s) => [s.id, s]));

  root.innerHTML = `
    <div class="view-header">
      <h2>홈</h2>
    </div>
    <div class="dash-date">${formatDateKr()}</div>
    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-num">${activeStudents.length}</div>
        <div class="stat-label">재원 원생</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">${todayAttendance.length}</div>
        <div class="stat-label">오늘 출석</div>
      </div>
      <div class="stat-card stat-card-danger">
        <div class="stat-num">${alerts.overdue.length}</div>
        <div class="stat-label">원비 연체</div>
      </div>
      <div class="stat-card stat-card-warn">
        <div class="stat-num">${alerts.upcoming.length}</div>
        <div class="stat-label">납부 임박</div>
      </div>
    </div>
    <button class="btn btn-primary btn-lg btn-block" id="go-attendance">출석 체크하러 가기</button>

    ${
      alerts.overdue.length || alerts.upcoming.length
        ? `<h3 class="section-title">원비 알림</h3>
           <div class="tuition-list">
            ${[...alerts.overdue, ...alerts.upcoming]
              .map(
                (a) => `
              <div class="tuition-row">
                <img class="avatar avatar-sm" src="${a.student.photo || AVATAR_PLACEHOLDER}" />
                <div class="tuition-row-info">
                  <div><b>${escapeHtml(a.student.name)}</b></div>
                  <div class="tuition-row-sub">${a.due.getMonth() + 1}월 ${a.due.getDate()}일 납부일</div>
                </div>
                ${a.diff < 0 ? `<span class="pill pill-red">${Math.abs(a.diff)}일 연체</span>` : a.diff === 0 ? `<span class="pill pill-orange">오늘</span>` : `<span class="pill">D-${a.diff}</span>`}
              </div>`
              )
              .join('')}
           </div>`
        : ''
    }

    <h3 class="section-title">오늘 출석 목록</h3>
    <div class="attendance-list">
      ${
        todayAttendance.length === 0
          ? `<p class="empty-msg">아직 출석한 원생이 없습니다.</p>`
          : todayAttendance
              .sort((a, b) => new Date(b.timeIn) - new Date(a.timeIn))
              .map((r) => {
                const s = studentMap.get(r.studentId);
                if (!s) return '';
                return `
                <div class="attendance-item">
                  <img class="avatar avatar-sm" src="${s.photo || AVATAR_PLACEHOLDER}" />
                  <div class="attendance-item-info">
                    <div><b>${escapeHtml(s.name)}</b></div>
                    <div class="attendance-item-sub">출석 ${timeStr(new Date(r.timeIn))} · 하원가능 ${timeStr(new Date(r.pickupTime))}</div>
                  </div>
                </div>`;
              })
              .join('')
      }
    </div>
  `;

  root.querySelector('#go-attendance').addEventListener('click', () => goTab('attendance'));
}
