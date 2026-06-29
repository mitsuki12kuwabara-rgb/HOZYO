const lineClient                                       = require('./lineClient');
const { client }                                       = lineClient;
const { getSession, saveSession, deleteSession,
        saveUser, getUser, saveShifts,
        getRequestsByCoach, saveAbsenceReport,
        saveFeedback }                                 = require('./gasClient');
const { sendCertificate }                              = require('./certificate');
const config                                           = require('./config');
const { STATE, SPORTS, adminUserId, adminImageSecret, renderUrl } = config;

const DAYS = ['月', '火', '水', '木', '金', '土', '日'];

const WEEKDAY_SLOTS = [
  '15:30〜17:30', '15:30〜18:00', '16:00〜18:00',
  '16:00〜18:30', '16:00〜19:00', '17:00〜19:00',
  '18:00〜20:00', '18:00〜21:00',
];
const WEEKEND_SLOTS = [
  '9:00〜12:00', '9:00〜13:00', '10:00〜12:00', '10:00〜13:00',
  '13:00〜15:00', '13:00〜17:00', '14:00〜17:00',
];

function getSlotOptions(day) {
  return (day === '土' || day === '日') ? WEEKEND_SLOTS : WEEKDAY_SLOTS;
}

// ── クイックリプライ ──
function qr(items) {
  return { items: items.map(([label, text]) => ({
    type: 'action', action: { type: 'message', label, text: text || label },
  })) };
}

// ── フォロー ──
async function handleFollow(userId) {
  // デフォルトリッチメニューをリンク（未登録メニュー）
  const defaultMenuId = process.env.DEFAULT_RICH_MENU_ID;
  if (defaultMenuId) {
    await lineClient.linkRichMenu(userId, defaultMenuId).catch(e => console.error('linkRichMenu follow:', e));
  }
  await client.pushMessage(userId, [{
    type: 'text',
    text: 'こんにちは！大学生コーチ登録サービスへようこそ🏅\n\n' +
          '全国大会出場経験のある大学生アスリートのコーチ登録を受け付けています。\n\n' +
          '下のメニューから「応募」を押してください。',
  }]);
}

// ── 登録開始 ──
async function startRegistration(userId, replyToken) {
  const existing = await getUser(userId);
  if (existing?.status === STATE.PENDING) {
    await client.replyMessage(replyToken, [{ type: 'text', text: '現在審査中です。しばらくお待ちください。' }]);
    return;
  }
  if (existing?.status === STATE.APPROVED) {
    await client.replyMessage(replyToken, [{ type: 'text', text: 'すでに登録済みです。メニューからご利用ください。' }]);
    return;
  }
  await saveSession(userId, STATE.NAME, {});
  await client.replyMessage(replyToken, [{
    type: 'text',
    text: 'コーチ登録を開始します📝\n\n① お名前（本名・フルネーム）を入力してください。\n例：山田 太郎',
  }]);
}

// ── ① 名前 ──
async function handleName(userId, message, replyToken, session) {
  if (message.type !== 'text' || !message.text.trim()) {
    await client.replyMessage(replyToken, [{ type: 'text', text: '名前をテキストで入力してください。' }]);
    return;
  }
  await saveSession(userId, STATE.AGE, { ...session.tempData, name: message.text.trim() });
  await client.replyMessage(replyToken, [{ type: 'text', text: '② 年齢を半角数字で入力してください。\n例：21' }]);
}

// ── ② 年齢 ──
async function handleAge(userId, message, replyToken, session) {
  const age = parseInt(message.text?.trim(), 10);
  if (message.type !== 'text' || isNaN(age) || age < 18 || age > 35) {
    await client.replyMessage(replyToken, [{ type: 'text', text: '18〜35の半角数字で入力してください。' }]);
    return;
  }
  await saveSession(userId, STATE.SPORT, { ...session.tempData, age });
  await client.replyMessage(replyToken, [{
    type: 'text', text: '③ 担当スポーツを選択してください。',
    quickReply: qr(SPORTS.map(s => [s])),
  }]);
}

// ── ③ スポーツ ──
async function handleSport(userId, message, replyToken, session) {
  if (message.type !== 'text' || !SPORTS.includes(message.text)) {
    await client.replyMessage(replyToken, [{
      type: 'text', text: 'バスケットボール・サッカー・野球から選んでください。',
      quickReply: qr(SPORTS.map(s => [s])),
    }]);
    return;
  }
  await saveSession(userId, STATE.HEIGHT_WEIGHT, { ...session.tempData, sport: message.text });
  await client.replyMessage(replyToken, [{
    type: 'text',
    text: '④ 身長・体重を入力してください。\n現役時との変化も記載してください。\n\n例：175cm・68kg（現役時65kg、+3kg）',
  }]);
}

// ── ④ 身長・体重 ──
async function handleHeightWeight(userId, message, replyToken, session) {
  if (message.type !== 'text' || !message.text.trim()) {
    await client.replyMessage(replyToken, [{ type: 'text', text: '身長・体重を入力してください。（例：175cm・68kg）' }]);
    return;
  }
  await saveSession(userId, STATE.PLAYING, { ...session.tempData, heightWeight: message.text.trim() });
  await client.replyMessage(replyToken, [{
    type: 'text',
    text: '⑤ 現在も何らかの形でプレーを継続していますか？\n\n（登録条件：現役でのプレー継続が必須です）',
    quickReply: qr([['はい', 'はい'], ['いいえ', 'いいえ']]),
  }]);
}

// ── ⑤ 現役継続確認 ──
async function handlePlaying(userId, message, replyToken, session) {
  const text = message.text?.trim();
  if (text === 'いいえ') {
    await deleteSession(userId);
    await client.replyMessage(replyToken, [{
      type: 'text',
      text: '申し訳ありません。\n\n本サービスのコーチ登録は「現在も何らかの形でプレーを継続中」であることが条件です。\n\nプレー再開後に改めてご応募ください。',
    }]);
    return;
  }
  if (text !== 'はい') {
    await client.replyMessage(replyToken, [{
      type: 'text', text: '「はい」または「いいえ」を選択してください。',
      quickReply: qr([['はい', 'はい'], ['いいえ', 'いいえ']]),
    }]);
    return;
  }
  await saveSession(userId, STATE.CAREER, { ...session.tempData, playing: true });
  await client.replyMessage(replyToken, [{
    type: 'text',
    text: '⑥ 競技歴とポジション歴を入力してください。\n\n例：高校3年間・大学3年間サッカー部。ポジション：FW（ストライカー）。全国選手権出場2回。',
  }]);
}

// ── ⑥ 競技歴・ポジション ──
async function handleCareer(userId, message, replyToken, session) {
  if (message.type !== 'text' || !message.text.trim()) {
    await client.replyMessage(replyToken, [{ type: 'text', text: '競技歴・ポジション歴を入力してください。' }]);
    return;
  }
  await saveSession(userId, STATE.STUDENT_ID, { ...session.tempData, career: message.text.trim() });
  await client.replyMessage(replyToken, [{
    type: 'text',
    text: '⑦ 学生証の写真を送ってください📸\n\n氏名・大学名・学年が確認できる面を撮影してください。',
  }]);
}

// ── ⑦ 学生証写真 ──
async function handleStudentId(userId, message, replyToken, session) {
  if (message.type !== 'image') {
    await client.replyMessage(replyToken, [{ type: 'text', text: '学生証の写真（画像）を送ってください。' }]);
    return;
  }
  await saveSession(userId, STATE.QUAL_TYPE, {
    ...session.tempData, studentIdMsgId: message.id,
  });
  await client.replyMessage(replyToken, [{
    type: 'text',
    text: '✅ 学生証を受け取りました！\n\n⑧ 資格の種類を選択してください。',
    quickReply: qr([
      ['全国大会出場', '全国大会出場'],
      ['エリア別大会ベスト4以上', 'エリア別大会ベスト4以上'],
    ]),
  }]);
}

// ── ⑧ 資格種別 ──
const QUAL_TYPES = ['全国大会出場', 'エリア別大会ベスト4以上'];
async function handleQualType(userId, message, replyToken, session) {
  if (message.type !== 'text' || !QUAL_TYPES.includes(message.text?.trim())) {
    await client.replyMessage(replyToken, [{
      type: 'text', text: '資格の種類を選択してください。',
      quickReply: qr(QUAL_TYPES.map(q => [q])),
    }]);
    return;
  }
  await saveSession(userId, STATE.TOURNAMENT_NAME, {
    ...session.tempData, qualType: message.text.trim(),
  });
  const hint = message.text.trim() === 'エリア別大会ベスト4以上'
    ? '例：関東高校バスケ選手権 ベスト4'
    : '例：全国高校バスケットボール選手権大会（ウインターカップ）';
  await client.replyMessage(replyToken, [{
    type: 'text',
    text: `⑨ 大会名を入力してください。\n${hint}`,
  }]);
}

// ── ⑨ 大会名 ──
async function handleTournamentName(userId, message, replyToken, session) {
  if (message.type !== 'text' || !message.text.trim()) {
    await client.replyMessage(replyToken, [{ type: 'text', text: '大会名をテキストで入力してください。' }]);
    return;
  }
  await saveSession(userId, STATE.TOURNAMENT_PROOF, {
    ...session.tempData, tournamentName: message.text.trim(),
  });
  await client.replyMessage(replyToken, [{
    type: 'text',
    text: '⑩ 出場を証明できる資料を送ってください📋\n\n' +
          '・試合のメンバー表の写真（名前が確認できるもの）\n' +
          '・名前が記載されたネット上のURL\n\n' +
          '写真または URL（テキスト）で送信してください。',
  }]);
}

// ── ⑥ 証明資料 ──
async function handleTournamentProof(userId, message, replyToken, session) {
  let proofMsgId  = '';
  let proofUrl    = '';

  if (message.type === 'image') {
    proofMsgId = message.id;
  } else if (message.type === 'text' && message.text.trim().startsWith('http')) {
    proofUrl = message.text.trim();
  } else {
    await client.replyMessage(replyToken, [{ type: 'text', text: '写真またはURL（https://...）を送ってください。' }]);
    return;
  }

  const tempData = { ...session.tempData, proofMsgId, proofUrl };
  await saveSession(userId, STATE.CONFIRM, tempData);
  await showConfirmation(replyToken, tempData);
}

// ── 確認画面 ──
async function showConfirmation(replyToken, data) {
  await client.replyMessage(replyToken, [{
    type: 'text',
    text: '📋 登録内容の確認\n\n' +
          `▶ 名前　　　：${data.name}\n` +
          `▶ 年齢　　　：${data.age}歳\n` +
          `▶ スポーツ　：${data.sport}\n` +
          `▶ 身長・体重：${data.heightWeight}\n` +
          `▶ 競技歴　　：${data.career}\n` +
          `▶ 資格種別　：${data.qualType}\n` +
          `▶ 大会名　　：${data.tournamentName}\n\n` +
          'この内容で申請しますか？',
    quickReply: qr([['✅ 申請する', '申請する'], ['🔄 やり直す', 'やり直す']]),
  }]);
}

// ── 確認への返答 ──
async function handleConfirmInput(userId, message, replyToken, session) {
  if (message.type !== 'text') return;
  if (message.text === '申請する') {
    // シフト登録フローへ
    await saveSession(userId, STATE.SHIFT_DAYS, { ...session.tempData, shiftDays: [], shifts: {} });
    await client.replyMessage(replyToken, [{
      type: 'text',
      text: '⑦ シフト登録\n\n対応可能な曜日を選んでください。\n（複数選択できます。選び終わったら「選択完了」を押してください）',
      quickReply: qr(DAYS.map(d => [d]).concat([['選択完了', '選択完了']])),
    }]);
  } else if (message.text === 'やり直す') {
    await deleteSession(userId);
    await client.replyMessage(replyToken, [{ type: 'text', text: '登録をリセットしました。「コーチ登録する」から再度お試しください。' }]);
  }
}

// ── シフト：曜日選択 ──
async function handleShiftDays(userId, message, replyToken, session) {
  const text = message.text?.trim();
  const tempData = session.tempData;
  const selected = tempData.shiftDays || [];

  if (text === '選択完了') {
    if (selected.length === 0) {
      await client.replyMessage(replyToken, [{
        type: 'text', text: '少なくとも1つの曜日を選択してください。',
        quickReply: qr(DAYS.map(d => [d]).concat([['選択完了', '選択完了']])),
      }]);
      return;
    }
    await saveSession(userId, STATE.SHIFT_SLOT, { ...tempData, currentDayIdx: 0, currentSlots: [] });
    await askShiftSlots(replyToken, selected[0]);
    return;
  }

  if (DAYS.includes(text) && !selected.includes(text)) selected.push(text);
  await saveSession(userId, STATE.SHIFT_DAYS, { ...tempData, shiftDays: selected });
  const remaining = DAYS.filter(d => !selected.includes(d));
  await client.replyMessage(replyToken, [{
    type: 'text',
    text: `✅ 選択中：${selected.join('・')}\n\n他の曜日も選ぶか「選択完了」を押してください。`,
    quickReply: qr(remaining.map(d => [d]).concat([['選択完了', '選択完了']])),
  }]);
}

async function askShiftSlots(replyToken, day) {
  const options = getSlotOptions(day);
  const type = (day === '土' || day === '日') ? '（午前・午後を複数選択できます）' : '（複数選択できます）';
  await client.replyMessage(replyToken, [{
    type: 'text',
    text: `${day}曜日の対応可能な時間帯を選んでください。\n${type}`,
    quickReply: qr(options.map(o => [o]).concat([['この曜日は完了', 'この曜日は完了']])),
  }]);
}

// ── シフト：時間帯選択 ──
async function handleShiftSlot(userId, message, replyToken, session) {
  const text = message.text?.trim();
  const tempData = session.tempData;
  const { shiftDays, currentDayIdx, shifts } = tempData;
  const currentSlots = tempData.currentSlots || [];
  const currentDay = shiftDays[currentDayIdx];
  const options = getSlotOptions(currentDay);

  if (text === 'この曜日は完了') {
    if (currentSlots.length === 0) {
      await client.replyMessage(replyToken, [{
        type: 'text', text: '少なくとも1つの時間帯を選択してください。',
        quickReply: qr(options.map(o => [o]).concat([['この曜日は完了', 'この曜日は完了']])),
      }]);
      return;
    }
    const newShifts = { ...shifts, [currentDay]: currentSlots };
    const nextIdx = currentDayIdx + 1;
    if (nextIdx >= shiftDays.length) {
      await saveSession(userId, STATE.SHIFT_CONFIRM, { ...tempData, shifts: newShifts });
      await showShiftConfirmation(replyToken, shiftDays, newShifts);
    } else {
      await saveSession(userId, STATE.SHIFT_SLOT, { ...tempData, shifts: newShifts, currentDayIdx: nextIdx, currentSlots: [] });
      await askShiftSlots(replyToken, shiftDays[nextIdx]);
    }
    return;
  }

  if (options.includes(text) && !currentSlots.includes(text)) {
    currentSlots.push(text);
    await saveSession(userId, STATE.SHIFT_SLOT, { ...tempData, currentSlots });
    const remaining = options.filter(o => !currentSlots.includes(o));
    await client.replyMessage(replyToken, [{
      type: 'text',
      text: `✅ ${currentDay}曜日 選択中：\n${currentSlots.join('\n')}\n\n他の時間帯を選ぶか「この曜日は完了」を押してください。`,
      quickReply: qr(remaining.map(o => [o]).concat([['この曜日は完了', 'この曜日は完了']])),
    }]);
    return;
  }

  await client.replyMessage(replyToken, [{
    type: 'text', text: 'ボタンから時間帯を選んでください。',
    quickReply: qr(options.map(o => [o]).concat([['この曜日は完了', 'この曜日は完了']])),
  }]);
}

async function showShiftConfirmation(replyToken, shiftDays, shifts) {
  const shiftText = shiftDays.map(d => `${d}曜日：${shifts[d].join('、')}`).join('\n');
  await client.replyMessage(replyToken, [{
    type: 'text',
    text: `📅 シフト確認\n\n${shiftText}\n\nこの内容で登録しますか？`,
    quickReply: qr([['✅ 登録する', '登録する'], ['🔄 シフトをやり直す', 'シフトをやり直す']]),
  }]);
}

// ── シフト：確認 ──
async function handleShiftConfirm(userId, message, replyToken, session) {
  const text = message.text?.trim();
  if (text === 'シフトをやり直す') {
    await saveSession(userId, STATE.SHIFT_DAYS, { ...session.tempData, shiftDays: [], shifts: {}, currentDayIdx: 0, currentSlots: [] });
    await client.replyMessage(replyToken, [{
      type: 'text',
      text: '対応可能な曜日を選び直してください。',
      quickReply: qr(DAYS.map(d => [d]).concat([['選択完了', '選択完了']])),
    }]);
    return;
  }
  if (text === '登録する') {
    await submitRegistration(userId, replyToken, session.tempData);
  }
}

// ── 欠席報告：開始 ──
async function startAbsenceReport(userId, replyToken) {
  const requests = await getRequestsByCoach(userId);
  if (!requests || requests.length === 0) {
    await client.replyMessage(replyToken, [{ type: 'text', text: '現在マッチング中のセッションがありません。' }]);
    return;
  }
  const sessionList = requests.map((r, i) =>
    `${i + 1}. ${r.clubName}\n   ${r.sport} / ${r.days} / ${r.startTime}〜${r.endTime}`
  ).join('\n\n');
  await saveSession(userId, STATE.REPORT_SESSION, { absenceRequests: requests });
  const qrItems = requests.slice(0, 12).map((r, i) => {
    const label = `${i + 1}. ${r.days} ${r.startTime}〜${r.endTime}`.slice(0, 20);
    return [label, String(i + 1)];
  });
  await client.replyMessage(replyToken, [{
    type: 'text',
    text: `都合が悪いセッションを選んでください：\n\n${sessionList}`,
    quickReply: qr(qrItems),
  }]);
}

// ── 欠席報告：セッション選択 ──
async function handleReportSession(userId, message, replyToken, session) {
  const idx = parseInt(message.text?.trim(), 10) - 1;
  const requests = session.tempData.absenceRequests || [];
  if (isNaN(idx) || idx < 0 || idx >= requests.length) {
    await client.replyMessage(replyToken, [{
      type: 'text', text: '番号をボタンから選んでください。',
      quickReply: qr(requests.slice(0, 12).map((r, i) => [`${i + 1}. ${r.clubName}`, String(i + 1)])),
    }]);
    return;
  }
  const selected = requests[idx];
  await saveSession(userId, STATE.REPORT_DATE, { ...session.tempData, selectedRequest: selected });
  await client.replyMessage(replyToken, [{
    type: 'text',
    text: `【${selected.clubName} / ${selected.days} ${selected.startTime}〜${selected.endTime}】\n\n都合が悪い日付を入力してください。\n（例：7月5日、7/5）`,
  }]);
}

// ── 欠席報告：日付入力 ──
async function handleReportDate(userId, message, replyToken, session) {
  const date = message.text?.trim();
  if (!date) {
    await client.replyMessage(replyToken, [{ type: 'text', text: '日付を入力してください。（例：7月5日）' }]);
    return;
  }
  await saveSession(userId, STATE.REPORT_REASON, { ...session.tempData, absenceDate: date });
  await client.replyMessage(replyToken, [{
    type: 'text',
    text: '理由があれば入力してください。\n（任意：スキップする場合は「スキップ」と送信）',
  }]);
}

// ── 欠席報告：理由入力 ──
async function handleReportReason(userId, message, replyToken, session) {
  const reason = message.text?.trim() === 'スキップ' ? '' : message.text?.trim();
  const d = session.tempData;
  await saveSession(userId, STATE.REPORT_CONFIRM, { ...d, absenceReason: reason });
  const r = d.selectedRequest;
  await client.replyMessage(replyToken, [{
    type: 'text',
    text: `【欠席報告の確認】\n\nセッション：${r.clubName}\n曜日・時間：${r.days} ${r.startTime}〜${r.endTime}\n日付：${d.absenceDate}${reason ? `\n理由：${reason}` : ''}\n\nこの内容で報告しますか？`,
    quickReply: qr([['✅ 報告する', '報告する'], ['キャンセル', 'キャンセル']]),
  }]);
}

// ── 欠席報告：確認 ──
async function handleReportConfirm(userId, message, replyToken, session) {
  const text = message.text?.trim();
  if (text === 'キャンセル') {
    await saveSession(userId, STATE.APPROVED, {});
    await client.replyMessage(replyToken, [{ type: 'text', text: '報告をキャンセルしました。' }]);
    return;
  }
  if (text !== '報告する') return;

  const d = session.tempData;
  const r = d.selectedRequest;
  const coach = await getUser(userId);

  await saveAbsenceReport(userId, {
    requestId: r.requestId, clubName: r.clubName, date: d.absenceDate,
    reason: d.absenceReason, coachName: coach?.name || '',
  });

  // 管理者通知
  await client.pushMessage(adminUserId, [{
    type: 'flex', altText: `【欠席報告】${coach?.name || ''} さん`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#e05c2a',
        contents: [{ type: 'text', text: '⚠️ コーチ欠席報告', weight: 'bold', size: 'lg', color: '#ffffff' }],
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm',
        contents: [
          row('コーチ名',   coach?.name || ''),
          row('登録番号',   coach?.regNo || ''),
          row('クラブ',     r.clubName),
          row('スポーツ',   r.sport),
          row('通常曜日',   `${r.days} ${r.startTime}〜${r.endTime}`),
          row('欠席日',     d.absenceDate),
          row('理由',       d.absenceReason || '（未記入）'),
        ],
      },
    },
  }]);

  await saveSession(userId, STATE.APPROVED, {});
  await client.replyMessage(replyToken, [{
    type: 'text',
    text: `✅ 報告を受け付けました。\n\n欠席日：${d.absenceDate}\nセッション：${r.clubName}\n\n担当者が確認次第、このLINEでご連絡します。`,
  }]);
}

// ── 申請送信 ──
async function submitRegistration(userId, replyToken, data) {
  try {
    const { regNo } = await saveUser(userId, data);
    if (data.shifts) await saveShifts(userId, data.shifts);
    await saveSession(userId, STATE.PENDING, {});
    await notifyAdmin(userId, data, regNo);
    await client.replyMessage(replyToken, [{
      type: 'text',
      text: `✅ 登録申請を受け付けました！\n\n登録番号：${regNo}\n\n` +
            '運営が内容を確認し、審査結果をこのLINEでご連絡します。\n通常3〜5営業日以内にご連絡いたします。',
    }]);
  } catch (err) {
    console.error('submitRegistration error:', err);
    await client.replyMessage(replyToken, [{ type: 'text', text: '申請の送信に失敗しました。もう一度お試しください。' }]);
  }
}

// ── 管理者通知 ──
async function notifyAdmin(userId, data, regNo) {
  // 画像確認URL（Renderで画像をストリームして返す）
  const imgBase = `${renderUrl}/image?secret=${adminImageSecret}&msgId=`;
  const studentIdLink = data.studentIdMsgId
    ? `${imgBase}${data.studentIdMsgId}`
    : null;
  const proofLink = data.proofMsgId
    ? `${imgBase}${data.proofMsgId}`
    : data.proofUrl || null;

  const imageButtons = [];
  if (studentIdLink) imageButtons.push({
    type: 'button', style: 'link', height: 'sm', margin: 'sm',
    action: { type: 'uri', label: '📎 学生証を確認する', uri: studentIdLink },
  });
  if (proofLink) imageButtons.push({
    type: 'button', style: 'link', height: 'sm',
    action: { type: 'uri', label: '📎 証明資料を確認する', uri: proofLink },
  });

  await client.pushMessage(adminUserId, [{
    type: 'flex',
    altText: `【新規登録申請】${data.name} さん`,
    contents: {
      type: 'bubble', size: 'mega',
      header: {
        type: 'box', layout: 'vertical', paddingAll: '16px',
        backgroundColor: '#1DB446',
        contents: [
          { type: 'text', text: '📬 新規コーチ登録申請', weight: 'bold', size: 'lg', color: '#ffffff' },
          { type: 'text', text: regNo, size: 'sm', color: '#e0ffe0', margin: 'sm' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px',
        contents: [
          row('名前',       data.name),
          row('年齢',       `${data.age}歳`),
          row('スポーツ',   data.sport),
          row('身長・体重', data.heightWeight || ''),
          row('競技歴',     data.career || ''),
          row('資格種別',   data.qualType || ''),
          row('大会名',     data.tournamentName),
          ...(data.shifts ? [
            { type: 'separator', margin: 'lg' },
            { type: 'text', text: '📅 シフト', weight: 'bold', size: 'sm', margin: 'md' },
            ...Object.entries(data.shifts).map(([day, slots]) => row(`${day}曜日`, slots.join('、'))),
          ] : []),
          { type: 'separator', margin: 'lg' },
          ...imageButtons,
          { type: 'text', text: `LINE ID: ${userId}`, size: 'xxs', color: '#aaaaaa', margin: 'md', wrap: true },
        ],
      },
      footer: {
        type: 'box', layout: 'horizontal', spacing: 'sm', paddingAll: '12px',
        contents: [
          {
            type: 'button', style: 'primary', color: '#0077b6', flex: 1,
            action: {
              type: 'postback', label: '🎤 面接を依頼',
              data: `action=interview&userId=${userId}&regNo=${encodeURIComponent(regNo)}&name=${encodeURIComponent(data.name)}`,
            },
          },
          {
            type: 'button', style: 'secondary', flex: 1,
            action: {
              type: 'postback', label: '❌ 却下する',
              data: `action=reject&userId=${userId}&name=${encodeURIComponent(data.name)}`,
            },
          },
        ],
      },
    },
  }]);
}

function row(label, value) {
  return {
    type: 'box', layout: 'horizontal', margin: 'sm',
    contents: [
      { type: 'text', text: label, size: 'sm', color: '#777777', flex: 2 },
      { type: 'text', text: String(value), size: 'sm', color: '#111111', flex: 4, wrap: true },
    ],
  };
}

// ── 詳細情報 ──
async function handleDetails(userId, replyToken) {
  await client.replyMessage(replyToken, [
    {
      type: 'flex',
      altText: '【HOZYO!!】求人詳細',
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box', layout: 'vertical', paddingAll: '16px',
          backgroundColor: '#F5E642',
          contents: [
            { type: 'text', text: '体育会外部コーチ派遣事業', weight: 'bold', size: 'md', color: '#000000' },
            { type: 'text', text: '全国経験者だけができるアルバイト', weight: 'bold', size: 'xl', color: '#000000', margin: 'sm', wrap: true },
          ],
        },
        body: {
          type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'md',
          contents: [
            {
              type: 'box', layout: 'horizontal', spacing: 'sm',
              contents: [
                { type: 'text', text: '💰', size: 'xl', flex: 0 },
                {
                  type: 'box', layout: 'vertical', flex: 1,
                  contents: [
                    { type: 'text', text: '時給', size: 'sm', color: '#888888' },
                    { type: 'text', text: '1,600円〜', weight: 'bold', size: 'xl', color: '#e05c2a' },
                  ],
                },
              ],
            },
            { type: 'separator' },
            { type: 'text', text: '📌 仕事内容', weight: 'bold', size: 'md' },
            { type: 'text', text: '小・中学生のクラブチームや部活動の外部コーチとして活動していただきます。全国大会出場経験を活かして、次世代の選手たちをサポートする仕事です。', size: 'sm', wrap: true, color: '#333333' },
            { type: 'separator' },
            { type: 'text', text: '🏅 応募資格', weight: 'bold', size: 'md' },
            {
              type: 'box', layout: 'vertical', spacing: 'sm',
              contents: [
                { type: 'text', text: '✅ 大学在学中', size: 'sm', color: '#333333' },
                { type: 'text', text: '✅ 全国大会出場経験あり', size: 'sm', color: '#333333' },
                { type: 'text', text: '✅ バスケ・サッカー・野球いずれか', size: 'sm', color: '#333333' },
              ],
            },
            { type: 'separator' },
            { type: 'text', text: '🌟 こんな方にピッタリ', weight: 'bold', size: 'md' },
            { type: 'text', text: '「競技を続けながら稼ぎたい」\n「スポーツで社会貢献したい」\n「将来、指導者を目指している」', size: 'sm', wrap: true, color: '#333333' },
            { type: 'separator' },
            { type: 'text', text: '📍 勤務地・シフト', weight: 'bold', size: 'md' },
            { type: 'text', text: '週1日〜OK・自分のスケジュールに合わせて調整可能。活動地域はマッチング後に決定します。', size: 'sm', wrap: true, color: '#333333' },
          ],
        },
        footer: {
          type: 'box', layout: 'vertical', paddingAll: '12px',
          backgroundColor: '#F5E642',
          contents: [
            {
              type: 'button', style: 'primary', color: '#000000',
              action: { type: 'message', label: '📝 今すぐ応募する', text: '応募' },
            },
          ],
        },
      },
    },
  ]);
}

// ── 問い合わせ ──
async function handleInquiry(userId, replyToken) {
  await client.pushMessage(adminUserId, [{
    type: 'text',
    text: `📞 お問い合わせがありました\nLine ID: ${userId}\n\n直接このユーザーにご連絡ください。`,
  }]);
  await client.replyMessage(replyToken, [
    {
      type: 'flex',
      altText: 'お問い合わせ',
      contents: {
        type: 'bubble',
        body: {
          type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'md',
          contents: [
            { type: 'text', text: 'お問い合わせ', weight: 'bold', size: 'xl' },
            { type: 'separator', margin: 'md' },
            {
              type: 'box', layout: 'horizontal', margin: 'lg', spacing: 'sm',
              contents: [
                { type: 'text', text: '📞', size: 'xl', flex: 0 },
                {
                  type: 'box', layout: 'vertical', flex: 1,
                  contents: [
                    { type: 'text', text: 'お電話はこちら', size: 'sm', color: '#888888' },
                    { type: 'text', text: '080-8089-0670', weight: 'bold', size: 'lg', color: '#1DB446' },
                    { type: 'text', text: '受付時間：10:00〜20:00', size: 'xs', color: '#aaaaaa', margin: 'xs' },
                  ],
                },
              ],
            },
            { type: 'separator' },
            { type: 'text', text: '💬 LINEでのご質問', weight: 'bold', size: 'sm', margin: 'md' },
            { type: 'text', text: 'このトーク画面にメッセージを送っていただければ、担当者が確認次第ご返信いたします。', size: 'sm', wrap: true, color: '#555555' },
          ],
        },
        footer: {
          type: 'box', layout: 'vertical', paddingAll: '12px',
          contents: [
            {
              type: 'button', style: 'primary', color: '#1DB446',
              action: { type: 'uri', label: '📞 電話をかける', uri: 'tel:08080890670' },
            },
          ],
        },
      },
    },
  ]);
}

// ── フィードバック：開始 ──
async function startFeedback(userId, replyToken, testMode = false) {
  const user = await getUser(userId);
  if (!user || user.status !== STATE.APPROVED) {
    await client.replyMessage(replyToken, [{ type: 'text', text: 'フィードバックはコーチ承認後に送ることができます。' }]);
    return;
  }

  if (!testMode) {
    const requests = await getRequestsByCoach(userId);
    if (!requests || requests.length === 0) {
      await client.replyMessage(replyToken, [{
        type: 'text',
        text: '現在マッチング中のセッションがないため、フィードバックを送ることができません。',
      }]);
      return;
    }

    if (requests.length === 1) {
      // 1件のみなら自動選択
      const r = requests[0];
      await saveSession(userId, STATE.FB_RATING, {
        fbCoachName: user.name,
        fbRequest: { requestId: r.requestId, clubName: r.clubName, sport: r.sport, days: r.days, startTime: r.startTime, endTime: r.endTime },
      });
      await client.replyMessage(replyToken, [{
        type: 'text',
        text: `⭐ フィードバック送信\n\nセッション：${r.clubName}（${r.days} ${r.startTime}〜${r.endTime}）\n\n今回の指導を5段階で評価してください。`,
        quickReply: qr([['⭐ 1', '1'], ['⭐⭐ 2', '2'], ['⭐⭐⭐ 3', '3'], ['⭐⭐⭐⭐ 4', '4'], ['⭐⭐⭐⭐⭐ 5', '5']]),
      }]);
      return;
    }

    // 複数ある場合はセッション選択
    const sessionList = requests.map((r, i) =>
      `${i + 1}. ${r.clubName}（${r.days} ${r.startTime}〜${r.endTime}）`
    ).join('\n');
    await saveSession(userId, STATE.FB_SESSION, { fbCoachName: user.name, fbRequests: requests });
    await client.replyMessage(replyToken, [{
      type: 'text',
      text: `フィードバックを送るセッションを選んでください：\n\n${sessionList}`,
      quickReply: qr(requests.slice(0, 12).map((r, i) => [`${i + 1}. ${r.clubName}`, String(i + 1)])),
    }]);
    return;
  }

  // テストモード：マッチングなしで送信可能
  await saveSession(userId, STATE.FB_RATING, { fbCoachName: user.name, fbRequest: null, fbTestMode: true });
  await client.replyMessage(replyToken, [{
    type: 'text',
    text: '⭐ フィードバック送信（テストモード）\n\n今回の指導セッションを5段階で評価してください。',
    quickReply: qr([['⭐ 1', '1'], ['⭐⭐ 2', '2'], ['⭐⭐⭐ 3', '3'], ['⭐⭐⭐⭐ 4', '4'], ['⭐⭐⭐⭐⭐ 5', '5']]),
  }]);
}

// ── フィードバック：セッション選択 ──
async function handleFbSession(userId, message, replyToken, session) {
  const idx = parseInt(message.text?.trim(), 10) - 1;
  const requests = session.tempData.fbRequests || [];
  if (isNaN(idx) || idx < 0 || idx >= requests.length) {
    await client.replyMessage(replyToken, [{
      type: 'text', text: '番号をボタンから選んでください。',
      quickReply: qr(requests.slice(0, 12).map((r, i) => [`${i + 1}. ${r.clubName}`, String(i + 1)])),
    }]);
    return;
  }
  const r = requests[idx];
  await saveSession(userId, STATE.FB_RATING, {
    ...session.tempData,
    fbRequest: { requestId: r.requestId, clubName: r.clubName, sport: r.sport, days: r.days, startTime: r.startTime, endTime: r.endTime },
  });
  await client.replyMessage(replyToken, [{
    type: 'text',
    text: `⭐ フィードバック送信\n\nセッション：${r.clubName}（${r.days} ${r.startTime}〜${r.endTime}）\n\n今回の指導を5段階で評価してください。`,
    quickReply: qr([['⭐ 1', '1'], ['⭐⭐ 2', '2'], ['⭐⭐⭐ 3', '3'], ['⭐⭐⭐⭐ 4', '4'], ['⭐⭐⭐⭐⭐ 5', '5']]),
  }]);
}

// ── フィードバック：評価 ──
async function handleFbRating(userId, message, replyToken, session) {
  const rating = parseInt(message.text?.trim(), 10);
  if (isNaN(rating) || rating < 1 || rating > 5) {
    await client.replyMessage(replyToken, [{
      type: 'text', text: '1〜5の数字をボタンから選んでください。',
      quickReply: qr([['⭐ 1', '1'], ['⭐⭐ 2', '2'], ['⭐⭐⭐ 3', '3'], ['⭐⭐⭐⭐ 4', '4'], ['⭐⭐⭐⭐⭐ 5', '5']]),
    }]);
    return;
  }
  await saveSession(userId, STATE.FB_COMMENT, { ...session.tempData, fbRating: rating });
  await client.replyMessage(replyToken, [{
    type: 'text',
    text: `評価：${'⭐'.repeat(rating)}（${rating}）\n\nコメントがあれば入力してください。\n（スキップする場合は「スキップ」と送信）`,
  }]);
}

// ── フィードバック：コメント ──
async function handleFbComment(userId, message, replyToken, session) {
  const comment = message.text?.trim() === 'スキップ' ? '' : message.text?.trim();
  const d = session.tempData;

  const r = d.fbRequest;
  await saveFeedback(userId, {
    coachName: d.fbCoachName, rating: d.fbRating, comment,
    clubName: r?.clubName || '', requestId: r?.requestId || '',
    testMode: d.fbTestMode || false,
  });

  // 管理者通知
  const bodyRows = [
    row('コーチ名', d.fbCoachName),
    ...(r ? [
      row('クラブ名', r.clubName),
      row('スポーツ', r.sport),
      row('曜日・時間', `${r.days} ${r.startTime}〜${r.endTime}`),
    ] : [row('クラブ', '（テストモード・未選択）')]),
    row('評価', '⭐'.repeat(d.fbRating) + `（${d.fbRating}/5）`),
    row('コメント', comment || '（なし）'),
    { type: 'text', text: `LINE ID: ${userId}`, size: 'xxs', color: '#aaaaaa', margin: 'md', wrap: true },
  ];

  await client.pushMessage(adminUserId, [{
    type: 'flex', altText: `【フィードバック】${d.fbCoachName} コーチ`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#f4a261',
        contents: [
          { type: 'text', text: '📝 フィードバック受信', weight: 'bold', size: 'lg', color: '#ffffff' },
          ...(d.fbTestMode ? [{ type: 'text', text: '※テストモード', size: 'xs', color: '#fff3e0' }] : []),
        ],
      },
      body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: bodyRows },
    },
  }]);

  await saveSession(userId, STATE.APPROVED, {});
  await client.replyMessage(replyToken, [{
    type: 'text',
    text: `✅ フィードバックを送信しました。\n\n評価：${'⭐'.repeat(d.fbRating)}（${d.fbRating}/5）${comment ? `\nコメント：${comment}` : ''}\n\nありがとうございました！`,
  }]);
}

// ── 登録済みメニュー ──
async function handleMatchingCheck(userId, replyToken) {
  await client.replyMessage(replyToken, [{
    type: 'text',
    text: '🔍 マッチング状況\n\n現在、あなた宛の個別オファーはありません。\nオファーが届いた際はこのLINEで直接ご連絡します。',
  }]);
}

module.exports = {
  handleFollow, startRegistration,
  handleName, handleAge, handleSport,
  handleHeightWeight, handlePlaying, handleCareer,
  handleStudentId, handleQualType, handleTournamentName, handleTournamentProof,
  handleConfirmInput, handleMatchingCheck, handleInquiry, handleDetails,
  handleShiftDays, handleShiftSlot, handleShiftConfirm,
  startAbsenceReport, handleReportSession, handleReportDate,
  handleReportReason, handleReportConfirm,
  startFeedback, handleFbSession, handleFbRating, handleFbComment,
};
