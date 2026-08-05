import { DB } from './db.js';
import { escapeHtml, todayStr, timeStr, toast } from './utils.js';
import { sendSms, buildAttendanceMessage } from './sms.js';
import { appState } from './state.js';
import { AVATAR_PLACEHOLDER } from './students.js';

let keypadValue = '';
let intervalId = null;
const notifiedPickupIds = new Set();

export async function render(root) {
  root.innerHTML = `
    <div class="view-header">
      <h2>출석 체크</h2>
    </div>
    <div class="kiosk">
      <div class="kiosk-display" id="kiosk-display">개인번호를 입력하세요</div>
      <div class="keypad" id="keypad">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button class="key" data-key="${n}">${n}</button>`).join('')}
        <button class="key key-clear" data-key="clear">지움</button>
        <button class="key" data-key="0">0</button>
        <button class="key key-enter" data-key="enter">확인</button>
      </div>
    </div>
    <div id="confirm-area"></div>
    <h3 class="section-title">오늘 출석 현황 (<span id="today-date"></span>)</h3>
    <div id="today-list" class="attendance-list"></div>
  `;
  root.querySelector('#today-date').textContent = todayStr();
  keypadValue = '';
  updateDisplay(root);

  root.querySelector('#keypad').addEventListener('click', (e) => {
    const key = e.target.closest('.key')?.dataset.key;
    if (!key) return;
    if (key === 'clear') keypadValue = '';
    else if (key === 'enter') handleEnter(root);
    else if (keypadValue.length < 6) keypadValue += key;
    updateDisplay(root);
  });

  await renderTodayList(root);
  if (intervalId) clearInterval(intervalId);
  intervalId = setInterval(() => renderTodayList(root), 30000);
}

export function unmount() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function updateDisplay(root) {
  const el = root.querySelector('#kiosk-display');
  el.textContent = keypadValue ? keypadValue : '개인번호를 입력하세요';
}

async function handleEnter(root) {
  if (!keypadValue) return;
  const student = await DB.getByIndex('students', 'studentNo', keypadValue);
  const confirmArea = root.querySelector('#confirm-area');
  if (!student) {
    confirmArea.innerHTML = `<div class="confirm-card confirm-error">개인번호 <b>${escapeHtml(keypadValue)}</b> 원생을 찾을 수 없습니다.</div>`;
    keypadValue = '';
    updateDisplay(root);
    return;
  }

  const today = todayStr();
  const existing = await DB.getByIndex('attendance', 'studentId_date', [student.id, today]);

  keypadValue = '';
  updateDisplay(root);

  if (existing) {
    const t = new Date(existing.timeIn);
    confirmArea.innerHTML = `
      <div class="confirm-card">
        <img class="avatar" src="${student.photo || AVATAR_PLACEHOLDER}" />
        <div>
          <div class="confirm-name">${escapeHtml(student.name)} (#${escapeHtml(student.studentNo)})</div>
          <div>이미 오늘 ${timeStr(t)}에 출석 처리되었습니다.</div>
        </div>
      </div>`;
    return;
  }

  confirmArea.innerHTML = `
    <div class="confirm-card">
      <img class="avatar" src="${student.photo || AVATAR_PLACEHOLDER}" />
      <div class="confirm-body">
        <div class="confirm-name">${escapeHtml(student.name)} (#${escapeHtml(student.studentNo)})</div>
        <div>${escapeHtml(student.school || '')} ${escapeHtml(student.grade || '')}</div>
        <div class="confirm-actions">
          <button class="btn" id="confirm-cancel">취소</button>
          <button class="btn btn-primary btn-lg" id="confirm-attend">출석하기</button>
        </div>
      </div>
    </div>`;

  confirmArea.querySelector('#confirm-cancel').addEventListener('click', () => {
    confirmArea.innerHTML = '';
  });
  confirmArea.querySelector('#confirm-attend').addEventListener('click', async () => {
    await checkIn(root, student);
    confirmArea.innerHTML = '';
  });
}

async function checkIn(root, student) {
  const now = new Date();
  const pickup = new Date(now.getTime() + 60 * 60 * 1000);
  const record = {
    studentId: student.id,
    date: todayStr(now),
    timeIn: now.toISOString(),
    pickupTime: pickup.toISOString(),
    smsSent: false,
    smsMethod: null,
  };

  const settings = await DB.get('settings', 'academyName');
  const academyName = settings?.value || appState.academyName;
  const message = buildAttendanceMessage({
    academyName,
    studentName: student.name,
    dateStr: record.date,
    timeInStr: timeStr(now),
    pickupTimeStr: timeStr(pickup),
  });

  try {
    await DB.add('attendance', record);
  } catch (err) {
    toast('출석 기록 저장 실패: ' + err.message);
    return;
  }

  const targetPhone = student.parentPhone || student.phone;
  const result = await sendSms(targetPhone, message);
  record.smsSent = result.ok;
  record.smsMethod = result.method;
  const saved = await DB.getByIndex('attendance', 'studentId_date', [student.id, record.date]);
  if (saved) await DB.put('attendance', { ...saved, smsSent: result.ok, smsMethod: result.method });

  if (result.method === 'webhook' && result.ok) {
    toast(`${student.name} 출석 처리 · 보호자 문자 발송 완료`);
  } else if (result.method === 'manual') {
    toast(`${student.name} 출석 처리 · 문자 앱을 열었습니다. 전송을 눌러주세요.`);
  } else {
    toast(`${student.name} 출석 처리 완료 (문자 미발송: ${result.error || '연동 필요'})`);
  }

  await renderTodayList(root);
}

async function renderTodayList(root) {
  const listEl = root.querySelector('#today-list');
  if (!listEl) return;
  const today = todayStr();
  const [records, students] = await Promise.all([
    DB.getAllByIndex('attendance', 'date', today),
    DB.getAll('students'),
  ]);
  const studentMap = new Map(students.map((s) => [s.id, s]));
  records.sort((a, b) => new Date(b.timeIn) - new Date(a.timeIn));

  if (records.length === 0) {
    listEl.innerHTML = `<p class="empty-msg">오늘 출석한 원생이 없습니다.</p>`;
    return;
  }

  const now = Date.now();
  listEl.innerHTML = records
    .map((r) => {
      const s = studentMap.get(r.studentId);
      if (!s) return '';
      const pickup = new Date(r.pickupTime).getTime();
      const ready = now >= pickup;
      const remainMs = Math.max(0, pickup - now);
      const remainMin = Math.ceil(remainMs / 60000);
      if (ready && !notifiedPickupIds.has(r.id)) {
        notifiedPickupIds.add(r.id);
        notifyPickupReady(s.name);
      }
      return `
        <div class="attendance-item ${ready ? 'ready' : ''}">
          <img class="avatar avatar-sm" src="${s.photo || AVATAR_PLACEHOLDER}" />
          <div class="attendance-item-info">
            <div><b>${escapeHtml(s.name)}</b> <span class="student-no">#${escapeHtml(s.studentNo)}</span></div>
            <div class="attendance-item-sub">출석 ${timeStr(new Date(r.timeIn))} · 하원가능 ${timeStr(new Date(r.pickupTime))}</div>
          </div>
          <div class="attendance-status">
            ${ready ? '<span class="pill pill-green">하원 가능</span>' : `<span class="pill">${remainMin}분 남음</span>`}
          </div>
        </div>`;
    })
    .join('');
}

function notifyPickupReady(name) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    new Notification('하원 가능 알림', { body: `${name} 학생이 하원 가능 시간이 되었습니다.` });
  } catch {
    // 일부 브라우저는 서비스워커 경유 알림만 허용
  }
}
