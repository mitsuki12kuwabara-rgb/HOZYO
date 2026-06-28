const { clubClient }                                    = require('./clubClient');
const { getClubSession, saveClubSession, deleteClubSession,
        saveClub, getClub, saveRequest }                = require('./gasClient');
const config                                            = require('./config');

const CLUB_STATE = {
  NONE:         'CLUB_NONE',
  NAME:         'CLUB_NAME',
  SPORT:        'CLUB_SPORT',
  LOCATION:     'CLUB_LOCATION',
  AGE:          'CLUB_AGE',
  CONFIRM:      'CLUB_CONFIRM',
  REGISTERED:   'CLUB_REGISTERED',
  REQ_DAYS:     'REQ_DAYS',
  REQ_START:    'REQ_START',
  REQ_END:      'REQ_END',
  REQ_LOCATION: 'REQ_LOCATION',
  REQ_CONFIRM:  'REQ_CONFIRM',
};

const SPORTS = ['バスケットボール', 'サッカー', '野球'];
const DAYS   = ['月', '火', '水', '木', '金', '土', '日'];
const TIMES  = ['7:00','8:00','9:00','10:00','11:00','12:00','13:00',
                '14:00','15:00','16:00','17:00','18:00','19:00'];

function qr(items) {
  return { items: items.map(([label, text]) => ({
    type: 'action', action: { type: 'message', label, text: text || label },
  })) };
}

// ── フォロー ──
async function handleClubFollow(userId) {
  await clubClient.pushMessage(userId, [{
    type: 'text',
    text: 'HOZYO!! クラブへようこそ！\n\n外部コーチを要請できるサービスです。\n\nまず団体の登録をお願いします。\n\n「クラブ登録する」と送信してください。',
  }]);
}

// ── 登録開始 ──
async function startClubRegistration(userId, replyToken) {
  const club = await getClub(userId);
  if (club && club.userId) {
    await clubClient.replyMessage(replyToken, [{
      type: 'text', text: 'すでに登録済みです。\n「コーチを要請する」からご利用ください。',
    }]);
    return;
  }
  await saveClubSession(userId, CLUB_STATE.NAME, {});
  await clubClient.replyMessage(replyToken, [{
    type: 'text', text: '団体名（部活名・クラブ名）を入力してください。',
  }]);
}

// ── 部活名 ──
async function handleClubName(userId, message, replyToken, session) {
  const name = message.text?.trim();
  if (!name) { await clubClient.replyMessage(replyToken, [{type:'text',text:'団体名を入力してください。'}]); return; }
  await saveClubSession(userId, CLUB_STATE.SPORT, { ...session.tempData, name });
  await clubClient.replyMessage(replyToken, [{
    type: 'text', text: 'スポーツ種目を選択してください。',
    quickReply: qr(SPORTS.map(s => [s])),
  }]);
}

// ── スポーツ ──
async function handleClubSport(userId, message, replyToken, session) {
  const sport = message.text?.trim();
  if (!SPORTS.includes(sport)) {
    await clubClient.replyMessage(replyToken, [{
      type: 'text', text: 'ボタンから選択してください。',
      quickReply: qr(SPORTS.map(s => [s])),
    }]);
    return;
  }
  await saveClubSession(userId, CLUB_STATE.LOCATION, { ...session.tempData, sport });
  await clubClient.replyMessage(replyToken, [{
    type: 'text', text: '主な練習場所を入力してください。\n（例：○○市立体育館）',
  }]);
}

// ── 練習場所 ──
async function handleClubLocation(userId, message, replyToken, session) {
  const location = message.text?.trim();
  if (!location) { await clubClient.replyMessage(replyToken, [{type:'text',text:'練習場所を入力してください。'}]); return; }
  await saveClubSession(userId, CLUB_STATE.AGE, { ...session.tempData, location });
  await clubClient.replyMessage(replyToken, [{
    type: 'text', text: '指導対象の年齢を入力してください。\n（例：中学生・高校生・大学生）',
  }]);
}

// ── 対象年齢 ──
async function handleClubAge(userId, message, replyToken, session) {
  const age = message.text?.trim();
  if (!age) { await clubClient.replyMessage(replyToken, [{type:'text',text:'指導対象年齢を入力してください。'}]); return; }
  const d = { ...session.tempData, age };
  await saveClubSession(userId, CLUB_STATE.CONFIRM, d);
  await clubClient.replyMessage(replyToken, [{
    type: 'text',
    text: `【登録内容の確認】\n\n団体名：${d.name}\nスポーツ：${d.sport}\n練習場所：${d.location}\n指導対象：${d.age}\n\n登録しますか？`,
    quickReply: qr([['はい', 'はい'], ['最初からやり直す', '最初からやり直す']]),
  }]);
}

// ── 登録確認 ──
async function handleClubConfirm(userId, message, replyToken, session) {
  const text = message.text;
  if (text === '最初からやり直す') {
    await deleteClubSession(userId);
    await clubClient.replyMessage(replyToken, [{type:'text',text:'最初からやり直します。\n「クラブ登録する」と送信してください。'}]);
    return;
  }
  if (text !== 'はい') {
    await clubClient.replyMessage(replyToken, [{type:'text',text:'「はい」または「最初からやり直す」を選択してください。', quickReply: qr([['はい'],['最初からやり直す']])}]);
    return;
  }
  const d = session.tempData;
  const result = await saveClub(userId, d);
  await saveClubSession(userId, CLUB_STATE.REGISTERED, {});
  await clubClient.replyMessage(replyToken, [{
    type: 'text',
    text: `✅ 登録完了！\n\n登録番号：${result.regNo}\n\n「コーチを要請する」からコーチの要請ができます。`,
  }]);
}

// ── コーチ要請開始 ──
async function startRequest(userId, replyToken) {
  const club = await getClub(userId);
  if (!club || !club.userId) {
    await clubClient.replyMessage(replyToken, [{type:'text',text:'まず「クラブ登録する」から団体登録をしてください。'}]);
    return;
  }
  await saveClubSession(userId, CLUB_STATE.REQ_DAYS, { days: [], sport: club.sport, clubName: club.name });
  await clubClient.replyMessage(replyToken, [{
    type: 'text',
    text: 'コーチを要請する曜日を選択してください。\n（複数選択できます）',
    quickReply: qr(DAYS.map(d => [d]).concat([['選択完了', '選択完了']])),
  }]);
}

// ── 曜日選択 ──
async function handleReqDays(userId, message, replyToken, session) {
  const text    = message.text?.trim();
  const tempData = session.tempData || {};
  const selected = tempData.days || [];

  if (text === '選択完了') {
    if (selected.length === 0) {
      await clubClient.replyMessage(replyToken, [{
        type: 'text', text: '曜日を1つ以上選択してください。',
        quickReply: qr(DAYS.map(d => [d]).concat([['選択完了', '選択完了']])),
      }]);
      return;
    }
    await saveClubSession(userId, CLUB_STATE.REQ_START, tempData);
    await clubClient.replyMessage(replyToken, [{
      type: 'text',
      text: `選択した曜日：${selected.join('・')}\n\n開始時間を選択してください。`,
      quickReply: qr(TIMES.map(t => [t])),
    }]);
    return;
  }

  if (DAYS.includes(text)) {
    if (!selected.includes(text)) selected.push(text);
    await saveClubSession(userId, CLUB_STATE.REQ_DAYS, { ...tempData, days: selected });
    const remaining = DAYS.filter(d => !selected.includes(d));
    const items = remaining.map(d => [d]).concat([['選択完了', '選択完了']]);
    await clubClient.replyMessage(replyToken, [{
      type: 'text',
      text: `✅ 選択中：${selected.join('・')}\n\n他の曜日も追加するか「選択完了」を押してください。`,
      quickReply: qr(items),
    }]);
    return;
  }

  await clubClient.replyMessage(replyToken, [{
    type: 'text', text: 'ボタンから曜日を選択してください。',
    quickReply: qr(DAYS.map(d => [d]).concat([['選択完了', '選択完了']])),
  }]);
}

// ── 開始時間 ──
async function handleReqStart(userId, message, replyToken, session) {
  const text = message.text?.trim();
  if (!text) {
    await clubClient.replyMessage(replyToken, [{ type: 'text', text: '開始時間を入力してください。\n（例：9:00）' }]);
    return;
  }
  await saveClubSession(userId, CLUB_STATE.REQ_END, { ...session.tempData, startTime: text });
  await clubClient.replyMessage(replyToken, [{
    type: 'text', text: `開始：${text}\n\n終了時間を入力してください。\n（例：12:00）`,
  }]);
}

// ── 終了時間 ──
async function handleReqEnd(userId, message, replyToken, session) {
  const text = message.text?.trim();
  if (!text) {
    await clubClient.replyMessage(replyToken, [{ type: 'text', text: '終了時間を入力してください。\n（例：12:00）' }]);
    return;
  }
  await saveClubSession(userId, CLUB_STATE.REQ_LOCATION, { ...session.tempData, endTime: text });
  await clubClient.replyMessage(replyToken, [{
    type: 'text', text: `${session.tempData.startTime}〜${text}\n\nコーチ指導の練習場所を入力してください。\n（登録した練習場所と異なる場合も入力してください）`,
  }]);
}

// ── 要請場所 ──
async function handleReqLocation(userId, message, replyToken, session) {
  const location = message.text?.trim();
  if (!location) { await clubClient.replyMessage(replyToken, [{type:'text',text:'練習場所を入力してください。'}]); return; }
  const d = { ...session.tempData, reqLocation: location };
  await saveClubSession(userId, CLUB_STATE.REQ_CONFIRM, d);
  await clubClient.replyMessage(replyToken, [{
    type: 'text',
    text: `【要請内容の確認】\n\n曜日：${d.days.join('・')}\n時間：${d.startTime}〜${d.endTime}\n場所：${location}\nスポーツ：${d.sport}\n\nこの内容で要請しますか？`,
    quickReply: qr([['要請する', '要請する'], ['キャンセル', 'キャンセル']]),
  }]);
}

// ── 要請確認 ──
async function handleReqConfirm(userId, message, replyToken, session) {
  const text = message.text;
  if (text === 'キャンセル') {
    await saveClubSession(userId, CLUB_STATE.REGISTERED, {});
    await clubClient.replyMessage(replyToken, [{type:'text',text:'要請をキャンセルしました。'}]);
    return;
  }
  if (text !== '要請する') {
    await clubClient.replyMessage(replyToken, [{type:'text',text:'「要請する」または「キャンセル」を選択してください。', quickReply: qr([['要請する'],['キャンセル']])}]);
    return;
  }
  const d = session.tempData;
  const result = await saveRequest(userId, {
    sport:       d.sport,
    clubName:    d.clubName,
    days:        d.days.join('・'),
    startTime:   d.startTime,
    endTime:     d.endTime,
    reqLocation: d.reqLocation,
  });
  await saveClubSession(userId, CLUB_STATE.REGISTERED, {});
  await notifyClubAdmin(userId, result.requestId, d);
  await clubClient.replyMessage(replyToken, [{
    type: 'text',
    text: `✅ 要請を受け付けました！\n\n要請番号：${result.requestId}\n\nマッチング成立次第、このLINEでご連絡します。`,
  }]);
}

// ── 管理者通知 ──
async function notifyClubAdmin(clubUserId, requestId, d) {
  const adminId = config.clubAdminUserId;
  if (!adminId) return;
  const { clubClient: cc } = require('./clubClient');
  await cc.pushMessage(adminId, [
    {
      type: 'text',
      text: `📋 新しいコーチ要請\n\n要請番号：${requestId}\n団体名：${d.clubName}\nスポーツ：${d.sport}\n曜日：${d.days.join('・')}\n時間：${d.startTime}〜${d.endTime}\n場所：${d.reqLocation}`,
    },
    {
      type: 'flex',
      altText: 'コーチ要請が届きました',
      contents: {
        type: 'bubble',
        header: { type: 'box', layout: 'vertical', backgroundColor: '#1DB446',
          contents: [{ type: 'text', text: 'コーチをマッチングする', color: '#ffffff', weight: 'bold', size: 'md' }] },
        body: { type: 'box', layout: 'vertical', contents: [
          { type: 'text', text: `要請番号: ${requestId}`, size: 'sm', color: '#666666' },
          { type: 'text', text: `スポーツ: ${d.sport}`, size: 'sm', margin: 'sm' },
        ]},
        footer: { type: 'box', layout: 'vertical', contents: [{
          type: 'button', style: 'primary', color: '#1DB446',
          action: { type: 'postback', label: 'コーチ一覧を見る',
            data: `action=list_coaches&requestId=${requestId}&sport=${encodeURIComponent(d.sport)}&clubUserId=${clubUserId}` },
        }]},
      },
    },
  ]);
}

// ── 問い合わせ ──
async function handleClubInquiry(userId, replyToken) {
  await clubClient.replyMessage(replyToken, [{
    type: 'text',
    text: '📞 お問い合わせ\n\n電話：080-8089-0670\n\nまたはこのチャットでご質問いただければ、担当者が返信いたします。',
  }]);
}

module.exports = {
  CLUB_STATE,
  handleClubFollow,
  startClubRegistration,
  handleClubName,
  handleClubSport,
  handleClubLocation,
  handleClubAge,
  handleClubConfirm,
  startRequest,
  handleReqDays,
  handleReqStart,
  handleReqEnd,
  handleReqLocation,
  handleReqConfirm,
  handleClubInquiry,
};
