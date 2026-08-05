import { DB } from './db.js';
import { toast, setHeaderTitle } from './utils.js';
import { testWebhook } from './sms.js';
import { appState, DEFAULT_ACADEMY_NAME } from './state.js';

export async function render(root) {
  const [academyName, reminderDays, webhookUrl, autoOpen] = await Promise.all([
    DB.get('settings', 'academyName'),
    DB.get('settings', 'reminderDays'),
    DB.get('settings', 'smsWebhookUrl'),
    DB.get('settings', 'smsAutoOpen'),
  ]);

  root.innerHTML = `
    <div class="view-header"><h2>설정</h2></div>

    <section class="settings-section">
      <h3>학원 정보</h3>
      <label>학원명<input id="s-academyName" value="${academyName?.value || DEFAULT_ACADEMY_NAME}" placeholder="예: 도레미음악학원" /></label>
      <label>원비 알림 기준일 (며칠 전부터 알림)
        <input type="number" min="0" max="14" id="s-reminderDays" value="${reminderDays?.value ?? 3}" />
      </label>
      <button class="btn btn-primary" id="save-general">저장</button>
    </section>

    <section class="settings-section">
      <h3>문자(SMS) 연동</h3>
      <p class="hint">
        브라우저에서 문자 API(알리고, NHN Toast 등)를 직접 호출하면 API 키가 노출되어 위험합니다.
        아래 웹훅 URL에 <b>자체 서버 또는 Make.com/Zapier 같은 자동화 서비스</b> 주소를 입력하면
        {phone, message} JSON을 그 주소로 전송해 자동 발송됩니다.<br/>
        웹훅을 설정하지 않으면 출석 처리 시 안드로이드 기본 문자 앱이 열리며, 담당자가 확인 후
        전송 버튼만 누르면 됩니다(수동 발송).
      </p>
      <label>웹훅 URL<input id="s-webhook" value="${webhookUrl?.value || ''}" placeholder="https://..." /></label>
      <label class="checkbox-row"><input type="checkbox" id="s-autoopen" ${autoOpen?.value !== false ? 'checked' : ''}/> 웹훅 미설정/실패 시 문자 앱 자동으로 열기</label>
      <div class="btn-row">
        <button class="btn" id="test-webhook">웹훅 테스트</button>
        <button class="btn btn-primary" id="save-sms">저장</button>
      </div>
    </section>

    <section class="settings-section">
      <h3>알림 권한</h3>
      <p class="hint">하원 가능 시간이 되면 이 기기에서 알림을 표시하려면 권한을 허용해주세요. (앱이 열려있을 때 동작합니다)</p>
      <button class="btn" id="req-notif">알림 권한 요청</button>
      <span id="notif-status" class="hint"></span>
    </section>

    <section class="settings-section">
      <h3>데이터 백업 / 복원</h3>
      <p class="hint">모든 데이터는 이 기기에만 저장됩니다(오프라인 동작). 기기를 바꾸거나 초기화하기 전에 꼭 내보내기 해두세요.</p>
      <div class="btn-row">
        <button class="btn" id="export-data">내보내기(JSON)</button>
        <label class="btn" for="import-file">가져오기(JSON)</label>
        <input type="file" id="import-file" accept="application/json" hidden />
      </div>
    </section>

    <section class="settings-section">
      <h3>앱 설치</h3>
      <p class="hint">
        삼성 인터넷/크롬 브라우저에서 이 페이지를 연 뒤, 메뉴(⋮) → <b>"홈 화면에 추가"</b> 또는
        <b>"앱 설치"</b>를 선택하면 태블릿/휴대폰에 아이콘이 생성되어 일반 앱처럼 사용할 수 있습니다.
        설치 후에는 인터넷이 없어도 대부분의 기능이 동작합니다(문자 발송 제외).
      </p>
    </section>

    <section class="settings-section settings-danger">
      <h3>초기화</h3>
      <button class="btn btn-danger" id="reset-data">모든 데이터 삭제</button>
    </section>
  `;

  root.querySelector('#save-general').addEventListener('click', async () => {
    const name = root.querySelector('#s-academyName').value.trim() || DEFAULT_ACADEMY_NAME;
    const days = Number(root.querySelector('#s-reminderDays').value) || 0;
    await DB.put('settings', { key: 'academyName', value: name });
    await DB.put('settings', { key: 'reminderDays', value: days });
    appState.academyName = name;
    setHeaderTitle(name);
    toast('저장되었습니다.');
  });

  root.querySelector('#save-sms').addEventListener('click', async () => {
    await DB.put('settings', { key: 'smsWebhookUrl', value: root.querySelector('#s-webhook').value.trim() });
    await DB.put('settings', { key: 'smsAutoOpen', value: root.querySelector('#s-autoopen').checked });
    toast('저장되었습니다.');
  });

  root.querySelector('#test-webhook').addEventListener('click', async () => {
    const url = root.querySelector('#s-webhook').value.trim();
    if (!url) return toast('웹훅 URL을 입력하세요.');
    try {
      await testWebhook(url);
      toast('테스트 요청을 보냈습니다. 수신 여부를 확인하세요.');
    } catch (err) {
      toast('테스트 실패: ' + err.message);
    }
  });

  const notifStatusEl = root.querySelector('#notif-status');
  const updateNotifStatus = () => {
    if (typeof Notification === 'undefined') { notifStatusEl.textContent = '이 브라우저는 알림을 지원하지 않습니다.'; return; }
    notifStatusEl.textContent = `현재 상태: ${{ granted: '허용됨', denied: '거부됨', default: '미설정' }[Notification.permission]}`;
  };
  updateNotifStatus();
  root.querySelector('#req-notif').addEventListener('click', async () => {
    if (typeof Notification === 'undefined') return;
    await Notification.requestPermission();
    updateNotifStatus();
  });

  root.querySelector('#export-data').addEventListener('click', async () => {
    const data = await DB.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `academy-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  });

  root.querySelector('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('가져오기를 하면 현재 기기의 데이터가 백업 파일 내용으로 덮어써집니다. 계속할까요?')) {
      e.target.value = '';
      return;
    }
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await DB.importAll(data, { replace: true });
      toast('가져오기 완료. 앱을 새로고침합니다.');
      setTimeout(() => location.reload(), 1000);
    } catch (err) {
      toast('가져오기 실패: ' + err.message);
    }
  });

  root.querySelector('#reset-data').addEventListener('click', async () => {
    if (!confirm('정말 모든 원생/출결/원비/진도 데이터를 삭제할까요? 이 작업은 되돌릴 수 없습니다.')) return;
    if (!confirm('마지막 확인입니다. 삭제 전에 내보내기(백업)를 하셨나요? 계속 진행할까요?')) return;
    for (const store of ['students', 'attendance', 'payments', 'progress']) {
      await DB.clear(store);
    }
    toast('모든 데이터가 삭제되었습니다.');
    setTimeout(() => location.reload(), 800);
  });
}
