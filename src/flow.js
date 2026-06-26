const { client }                                       = require('./lineClient');
const { getSession, saveSession, deleteSession,
        saveUser, getUser }                            = require('./gasClient');
const { sendCertificate }                              = require('./certificate');
const config                                           = require('./config');
const { STATE, SPORTS, adminUserId, adminImageSecret, renderUrl } = config;

// ── クイックリプライ ──
function qr(items) {
  return { items: items.map(([label, text]) => ({
    type: 'action', action: { type: 'message', label, text: text || label },
  })) };
}

// ── フォロー ──
async function handleFollow(userId) {
  await client.pushMessage(userId, [{
    type: 'text',
    text: 'こんにちは！大学生コーチ登録サービスへようこそ🏅\n\n' +
          '全国大会出場経験のある大学生アスリートのコーチ登録を受け付けています。\n\n' +
          '下のメニューから「コーチ登録する」を押してください。',
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
  await saveSession(userId, STATE.STUDENT_ID, { ...session.tempData, sport: message.text });
  await client.replyMessage(replyToken, [{
    type: 'text',
    text: '④ 学生証の写真を送ってください📸\n\n氏名・大学名・学年が確認できる面を撮影してください。',
  }]);
}

// ── ④ 学生証写真 ──
async function handleStudentId(userId, message, replyToken, session) {
  if (message.type !== 'image') {
    await client.replyMessage(replyToken, [{ type: 'text', text: '学生証の写真（画像）を送ってください。' }]);
    return;
  }
  // メッセージIDを保存（後で管理者が画像確認URLから閲覧）
  await saveSession(userId, STATE.TOURNAMENT_NAME, {
    ...session.tempData, studentIdMsgId: message.id,
  });
  await client.replyMessage(replyToken, [{
    type: 'text',
    text: '✅ 学生証を受け取りました！\n\n⑤ 出場した全国大会の名前を入力してください。\n例：全国高校バスケットボール選手権大会（ウインターカップ）',
  }]);
}

// ── ⑤ 大会名 ──
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
    text: '⑥ 出場を証明できる資料を送ってください📋\n\n' +
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
          `▶ 名前　　：${data.name}\n` +
          `▶ 年齢　　：${data.age}歳\n` +
          `▶ スポーツ：${data.sport}\n` +
          `▶ 大会名　：${data.tournamentName}\n\n` +
          'この内容で申請しますか？',
    quickReply: qr([['✅ 申請する', '申請する'], ['🔄 やり直す', 'やり直す']]),
  }]);
}

// ── 確認への返答 ──
async function handleConfirmInput(userId, message, replyToken, session) {
  if (message.type !== 'text') return;
  if (message.text === '申請する') {
    await submitRegistration(userId, replyToken, session.tempData);
  } else if (message.text === 'やり直す') {
    await deleteSession(userId);
    await client.replyMessage(replyToken, [{ type: 'text', text: '登録をリセットしました。「コーチ登録する」から再度お試しください。' }]);
  }
}

// ── 申請送信 ──
async function submitRegistration(userId, replyToken, data) {
  try {
    const { regNo } = await saveUser(userId, data);
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
          row('名前',     data.name),
          row('年齢',     `${data.age}歳`),
          row('スポーツ', data.sport),
          row('大会名',   data.tournamentName),
          { type: 'separator', margin: 'lg' },
          ...imageButtons,
          { type: 'text', text: `LINE ID: ${userId}`, size: 'xxs', color: '#aaaaaa', margin: 'md', wrap: true },
        ],
      },
      footer: {
        type: 'box', layout: 'horizontal', spacing: 'sm', paddingAll: '12px',
        contents: [
          {
            type: 'button', style: 'primary', color: '#1DB446', flex: 1,
            action: {
              type: 'postback', label: '✅ 承認する',
              data: `action=approve&userId=${userId}&regNo=${encodeURIComponent(regNo)}&name=${encodeURIComponent(data.name)}`,
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

// ── 登録済みメニュー ──
async function handleMatchingCheck(userId, replyToken) {
  await client.replyMessage(replyToken, [{
    type: 'text',
    text: '🔍 マッチング状況\n\n現在、あなた宛の個別オファーはありません。\nオファーが届いた際はこのLINEで直接ご連絡します。',
  }]);
}

async function handleInquiry(userId, replyToken) {
  await client.pushMessage(adminUserId, [{
    type: 'text',
    text: `📞 お問い合わせがありました\nLine ID: ${userId}\n\n直接このユーザーにご連絡ください。`,
  }]);
  await client.replyMessage(replyToken, [{
    type: 'text', text: 'お問い合わせを受け付けました。担当者より折り返しご連絡いたします。',
  }]);
}

module.exports = {
  handleFollow, startRegistration,
  handleName, handleAge, handleSport,
  handleStudentId, handleTournamentName, handleTournamentProof,
  handleConfirmInput, handleMatchingCheck, handleInquiry,
};
