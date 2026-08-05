import { DB } from './db.js';
import { escapeHtml, formatPhone, fileToDataURL, parseCSV, debounce, toast } from './utils.js';
import { openModal, closeModal } from './modal.js';
import { appState } from './state.js';
import { goTab } from './router.js';

const AVATAR_PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#e5e7eb"/><circle cx="50" cy="38" r="18" fill="#9ca3af"/><path d="M20 88c4-22 18-33 30-33s26 11 30 33" fill="#9ca3af"/></svg>'
  );

async function getAllStudents() {
  const list = await DB.getAll('students');
  return list.sort((a, b) => (a.studentNo || '').localeCompare(b.studentNo || '', 'ko', { numeric: true }));
}

async function nextStudentNo() {
  const list = await DB.getAll('students');
  let max = 100;
  for (const s of list) {
    const n = parseInt(String(s.studentNo).replace(/\D/g, ''), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return String(max + 1);
}

let searchQuery = '';

export async function render(root) {
  const students = await getAllStudents();
  root.innerHTML = `
    <div class="view-header">
      <h2>원생 목록 <span class="badge">${students.length}명</span></h2>
      <div class="header-actions">
        <button class="btn" id="btn-csv">CSV 일괄등록</button>
        <button class="btn btn-primary" id="btn-add">+ 신규 등록</button>
      </div>
    </div>
    <input type="search" id="student-search" class="search-input" placeholder="이름, 번호, 학교로 검색" value="${escapeHtml(searchQuery)}" />
    <div id="student-list" class="student-grid"></div>
  `;

  root.querySelector('#btn-add').addEventListener('click', () => openStudentForm());
  root.querySelector('#btn-csv').addEventListener('click', () => openCsvImport(root));
  const searchInput = root.querySelector('#student-search');
  searchInput.addEventListener(
    'input',
    debounce((e) => {
      searchQuery = e.target.value;
      renderList(root, students);
    }, 150)
  );

  renderList(root, students);
}

function renderList(root, students) {
  const q = searchQuery.trim().toLowerCase();
  const filtered = q
    ? students.filter((s) =>
        [s.name, s.studentNo, s.school, s.phone].filter(Boolean).some((f) => String(f).toLowerCase().includes(q))
      )
    : students;

  const listEl = root.querySelector('#student-list');
  if (filtered.length === 0) {
    listEl.innerHTML = `<p class="empty-msg">등록된 원생이 없습니다. 신규 등록 또는 CSV 일괄등록을 이용하세요.</p>`;
    return;
  }
  listEl.innerHTML = filtered
    .map(
      (s) => `
      <div class="student-card" data-id="${s.id}">
        <img class="avatar" src="${s.photo || AVATAR_PLACEHOLDER}" alt="${escapeHtml(s.name)}" />
        <div class="student-card-info">
          <div class="student-card-name">${escapeHtml(s.name)} <span class="student-no">#${escapeHtml(s.studentNo)}</span></div>
          <div class="student-card-sub">${escapeHtml(s.school || '')} ${escapeHtml(s.grade || '')}</div>
          <div class="student-card-sub">${escapeHtml(formatPhone(s.phone))}</div>
        </div>
      </div>`
    )
    .join('');

  listEl.querySelectorAll('.student-card').forEach((card) => {
    card.addEventListener('click', async () => {
      const id = Number(card.dataset.id);
      const student = await DB.get('students', id);
      openStudentForm(student);
    });
  });
}

function openStudentForm(student = null) {
  const isEdit = !!student;
  const s = student || { studentNo: '', name: '', phone: '', parentPhone: '', school: '', grade: '', tuitionDay: '', tuitionAmount: '', memo: '', photo: '', active: true };

  const modalEl = openModal(
    `
    <div class="modal-header">
      <h3>${isEdit ? '원생 정보 수정' : '신규 원생 등록'}</h3>
      <button class="icon-btn" id="modal-close">✕</button>
    </div>
    <form id="student-form" class="form-grid">
      <div class="photo-upload">
        <img id="photo-preview" src="${s.photo || AVATAR_PLACEHOLDER}" alt="사진" />
        <label class="btn btn-sm" for="photo-input">사진 선택</label>
        <input type="file" id="photo-input" accept="image/*" capture="environment" hidden />
      </div>
      <label>개인번호(출석용)<input required id="f-studentNo" placeholder="예: 101" value="${escapeHtml(s.studentNo)}" /></label>
      <label>이름<input required id="f-name" value="${escapeHtml(s.name)}" /></label>
      <label>학생 전화번호<input id="f-phone" placeholder="01012345678" value="${escapeHtml(s.phone)}" /></label>
      <label>보호자 전화번호(문자수신)<input id="f-parentPhone" placeholder="비워두면 학생 번호로 발송" value="${escapeHtml(s.parentPhone)}" /></label>
      <label>학교<input id="f-school" value="${escapeHtml(s.school)}" /></label>
      <label>학년<input id="f-grade" placeholder="예: 초3" value="${escapeHtml(s.grade)}" /></label>
      <label>원비 납부일(매월)<input type="number" min="1" max="31" id="f-tuitionDay" value="${escapeHtml(s.tuitionDay)}" /></label>
      <label>원비 금액<input type="number" id="f-tuitionAmount" value="${escapeHtml(s.tuitionAmount)}" /></label>
      <label class="span-2">메모<textarea id="f-memo">${escapeHtml(s.memo)}</textarea></label>
      <label class="checkbox-row span-2"><input type="checkbox" id="f-active" ${s.active !== false ? 'checked' : ''} /> 재원중</label>
      <div class="modal-footer span-2">
        ${isEdit ? '<button type="button" class="btn btn-danger" id="btn-delete">삭제</button>' : '<span></span>'}
        <div class="footer-right">
          ${isEdit ? '<button type="button" class="btn" id="btn-progress">진도 보기</button><button type="button" class="btn" id="btn-tuition">원비 보기</button>' : ''}
          <button type="submit" class="btn btn-primary">${isEdit ? '저장' : '등록'}</button>
        </div>
      </div>
    </form>
  `,
    { onMount: setup }
  );

  async function setup(el) {
    if (!isEdit) {
      el.querySelector('#f-studentNo').value = await nextStudentNo();
    }
    el.querySelector('#modal-close').addEventListener('click', closeModal);

    el.querySelector('#photo-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const dataUrl = await fileToDataURL(file);
      el.querySelector('#photo-preview').src = dataUrl;
      el.querySelector('#photo-preview').dataset.value = dataUrl;
    });

    if (isEdit) {
      el.querySelector('#btn-delete').addEventListener('click', async () => {
        if (!confirm(`${s.name} 원생을 정말 삭제하시겠습니까? 출결/원비/진도 기록은 유지됩니다.`)) return;
        await DB.delete('students', s.id);
        closeModal();
        toast('삭제되었습니다.');
        goTab('students');
      });
      el.querySelector('#btn-progress').addEventListener('click', () => {
        appState.selectedStudentId = s.id;
        closeModal();
        goTab('progress');
      });
      el.querySelector('#btn-tuition').addEventListener('click', () => {
        appState.selectedStudentId = s.id;
        closeModal();
        goTab('tuition');
      });
    }

    el.querySelector('#student-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const photoVal = el.querySelector('#photo-preview').dataset.value || s.photo || '';
      const payload = {
        studentNo: el.querySelector('#f-studentNo').value.trim(),
        name: el.querySelector('#f-name').value.trim(),
        phone: el.querySelector('#f-phone').value.trim(),
        parentPhone: el.querySelector('#f-parentPhone').value.trim(),
        school: el.querySelector('#f-school').value.trim(),
        grade: el.querySelector('#f-grade').value.trim(),
        tuitionDay: Number(el.querySelector('#f-tuitionDay').value) || null,
        tuitionAmount: Number(el.querySelector('#f-tuitionAmount').value) || null,
        memo: el.querySelector('#f-memo').value.trim(),
        active: el.querySelector('#f-active').checked,
        photo: photoVal,
      };
      if (!payload.studentNo || !payload.name) {
        toast('개인번호와 이름은 필수입니다.');
        return;
      }
      try {
        const existing = await DB.getByIndex('students', 'studentNo', payload.studentNo);
        if (existing && (!isEdit || existing.id !== s.id)) {
          toast('이미 사용 중인 개인번호입니다.');
          return;
        }
        if (isEdit) {
          await DB.put('students', { ...s, ...payload, id: s.id });
        } else {
          await DB.add('students', { ...payload, createdAt: new Date().toISOString() });
        }
        closeModal();
        toast(isEdit ? '수정되었습니다.' : '등록되었습니다.');
        goTab('students');
      } catch (err) {
        toast('저장 중 오류: ' + err.message);
      }
    });
  }
}

const CSV_HEADER_ALIASES = {
  studentNo: ['개인번호', '번호', '원생번호', 'no', 'id'],
  name: ['이름', '성함', 'name'],
  phone: ['전화번호', '연락처', '학생전화번호', 'phone'],
  parentPhone: ['보호자전화번호', '보호자연락처', '부모님연락처', 'parentphone'],
  school: ['학교', 'school'],
  grade: ['학년', 'grade'],
  tuitionDay: ['납부일', '원비일', '원비납부일', 'tuitionday'],
  tuitionAmount: ['원비', '원비금액', '금액', 'tuitionamount'],
  memo: ['메모', '비고', 'memo'],
};

function mapHeader(header) {
  const norm = header.trim().toLowerCase().replace(/\s/g, '');
  for (const [key, aliases] of Object.entries(CSV_HEADER_ALIASES)) {
    if (aliases.some((a) => a.toLowerCase() === norm)) return key;
  }
  return null;
}

function openCsvImport(root) {
  const modalEl = openModal(
    `
    <div class="modal-header">
      <h3>CSV 일괄 등록</h3>
      <button class="icon-btn" id="modal-close">✕</button>
    </div>
    <div class="csv-import">
      <p class="hint">
        컬럼: <b>이름, 전화번호</b>(필수) / 개인번호, 보호자전화번호, 학교, 학년, 납부일, 원비, 메모(선택)<br/>
        개인번호를 비워두면 자동으로 번호가 부여됩니다. 첫 줄은 헤더(컬럼명)여야 합니다.
      </p>
      <a id="csv-template" class="btn btn-sm" download="원생등록양식.csv">양식 다운로드</a>
      <input type="file" id="csv-file" accept=".csv,text/csv" />
      <div id="csv-preview"></div>
      <div class="modal-footer">
        <span id="csv-summary"></span>
        <button class="btn btn-primary" id="csv-confirm" disabled>가져오기</button>
      </div>
    </div>
  `,
    { wide: true, onMount: setup }
  );

  let parsedRows = [];

  function setup(el) {
    el.querySelector('#modal-close').addEventListener('click', closeModal);

    const templateCsv = '이름,전화번호,보호자전화번호,학교,학년,납부일,원비,메모\n홍길동,01012345678,01098765432,행복초등학교,3학년,15,150000,';
    const blob = new Blob(['﻿' + templateCsv], { type: 'text/csv;charset=utf-8;' });
    el.querySelector('#csv-template').href = URL.createObjectURL(blob);

    el.querySelector('#csv-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length < 2) {
        toast('데이터가 없습니다.');
        return;
      }
      const headerRow = rows[0].map(mapHeader);
      const dataRows = rows.slice(1);
      const existing = await DB.getAll('students');
      const usedNos = new Set(existing.map((s) => s.studentNo));
      let auto = 100;
      for (const no of usedNos) {
        const n = parseInt(String(no).replace(/\D/g, ''), 10);
        if (!Number.isNaN(n) && n > auto) auto = n;
      }

      parsedRows = dataRows.map((cols) => {
        const obj = {};
        headerRow.forEach((key, i) => {
          if (key) obj[key] = (cols[i] || '').trim();
        });
        const errors = [];
        if (!obj.name) errors.push('이름 없음');
        if (!obj.phone) errors.push('전화번호 없음');
        if (!obj.studentNo) {
          auto += 1;
          obj.studentNo = String(auto);
        } else if (usedNos.has(obj.studentNo)) {
          errors.push(`개인번호 ${obj.studentNo} 중복`);
        } else {
          usedNos.add(obj.studentNo);
        }
        obj.tuitionDay = obj.tuitionDay ? Number(obj.tuitionDay) : null;
        obj.tuitionAmount = obj.tuitionAmount ? Number(obj.tuitionAmount) : null;
        obj.active = true;
        obj._errors = errors;
        return obj;
      });

      renderPreview(el);
    });

    el.querySelector('#csv-confirm').addEventListener('click', async () => {
      const validRows = parsedRows.filter((r) => r._errors.length === 0);
      for (const r of validRows) {
        const { _errors, ...payload } = r;
        await DB.add('students', { ...payload, createdAt: new Date().toISOString() });
      }
      closeModal();
      toast(`${validRows.length}명 등록 완료`);
      render(root);
    });
  }

  function renderPreview(el) {
    const okCount = parsedRows.filter((r) => r._errors.length === 0).length;
    const errCount = parsedRows.length - okCount;
    el.querySelector('#csv-summary').textContent = `전체 ${parsedRows.length}건 · 정상 ${okCount}건 · 오류 ${errCount}건`;
    el.querySelector('#csv-confirm').disabled = okCount === 0;
    el.querySelector('#csv-preview').innerHTML = `
      <div class="csv-table-wrap">
        <table class="csv-table">
          <thead><tr><th>번호</th><th>이름</th><th>전화번호</th><th>학교</th><th>학년</th><th>납부일</th><th>상태</th></tr></thead>
          <tbody>
            ${parsedRows
              .map(
                (r) => `
              <tr class="${r._errors.length ? 'row-error' : ''}">
                <td>${escapeHtml(r.studentNo)}</td>
                <td>${escapeHtml(r.name)}</td>
                <td>${escapeHtml(r.phone)}</td>
                <td>${escapeHtml(r.school || '')}</td>
                <td>${escapeHtml(r.grade || '')}</td>
                <td>${escapeHtml(r.tuitionDay || '')}</td>
                <td>${r._errors.length ? escapeHtml(r._errors.join(', ')) : 'OK'}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  }
}

export { getAllStudents, AVATAR_PLACEHOLDER };
