import { DB } from './db.js';

// 실제 문자 발송(알리고/NHN Toast 등 SMS API)은 API 키를 숨겨야 하므로
// 브라우저에서 직접 호출할 수 없습니다. 대신 두 가지 방식을 지원합니다.
// 1) 웹훅 방식: 설정에 등록한 서버(Make.com, Zapier, 자체 서버 등)로 POST 요청을
//    보내면, 그 서버가 실제 SMS API를 호출합니다. (권장, 완전 자동)
// 2) 수동 발송 방식: 웹훅이 없으면 안드로이드 기본 문자 앱을 여는 sms: 링크를
//    새 창으로 열어, 담당자가 확인 후 '전송' 버튼만 누르면 되도록 합니다.

export async function getSmsSettings() {
  const url = await DB.get('settings', 'smsWebhookUrl');
  const enabled = await DB.get('settings', 'smsAutoOpen');
  return {
    webhookUrl: url?.value || '',
    autoOpenManual: enabled?.value !== false,
  };
}

export function buildAttendanceMessage({ academyName, studentName, dateStr, timeInStr, pickupTimeStr }) {
  const [, m, d] = dateStr.split('-');
  return `[${academyName}] ${Number(m)}월 ${Number(d)}일 ${studentName} 학생이 ${timeInStr}에 출석하였습니다. 하원 가능 시간은 ${pickupTimeStr}입니다.`;
}

export function buildTuitionReminderMessage({ academyName, studentName, dueDateStr }) {
  const [, m, d] = dueDateStr.split('-');
  return `[${academyName}] ${studentName} 학생의 원비 납부일(${Number(m)}월 ${Number(d)}일)이 다가옵니다. 확인 부탁드립니다.`;
}

// 결과: { method: 'webhook' | 'manual' | 'skipped', ok: boolean, error?: string }
export async function sendSms(phone, message) {
  const { webhookUrl, autoOpenManual } = await getSmsSettings();
  const cleanPhone = String(phone || '').replace(/\D/g, '');
  if (!cleanPhone) return { method: 'skipped', ok: false, error: '전화번호 없음' };

  if (webhookUrl) {
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone, message }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { method: 'webhook', ok: true };
    } catch (err) {
      // 웹훅 실패 시 수동 발송으로 폴백
      if (autoOpenManual) openManualSms(cleanPhone, message);
      return { method: 'webhook', ok: false, error: String(err.message || err) };
    }
  }

  if (autoOpenManual) {
    openManualSms(cleanPhone, message);
    return { method: 'manual', ok: true };
  }
  return { method: 'skipped', ok: false, error: '문자 연동 미설정' };
}

export function openManualSms(phone, message) {
  const url = `sms:${phone}?body=${encodeURIComponent(message)}`;
  try {
    window.open(url, '_blank');
  } catch {
    // no-op: 데스크톱 브라우저 등 sms: 스킴 미지원 환경
  }
}

export async function testWebhook(url) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '01000000000', message: '[테스트] 음악학원 원생관리 앱 연동 테스트 메시지입니다.' }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return true;
}
