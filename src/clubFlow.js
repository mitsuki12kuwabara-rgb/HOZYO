const { clubClient }                                    = require('./clubClient');
const { getClubSession, saveClubSession, deleteClubSession,
        saveClub, getClub, saveRequest,
        getRequestsByClub, saveClubFeedback }           = require('./gasClient');
const config                                            = require('./config');

const CLUB_STATE = {
  NONE:         'CLUB_NONE',
  NAME:         'CLUB_NAME',
  SPORT:        'CLUB_SPORT',
  LOCATION:     'CLUB_LOCATION',
  AGE:          'CLUB_AGE',
  CONFIRM:      'CLUB_CONFIRM',
  REGISTERED:   'CLUB_REGISTERED',
  REQ_DAYS:       'REQ_DAYS',
  REQ_SLOT_START: 'REQ_SLOT_START',
  REQ_SLOT_END:   'REQ_SLOT_END',
  REQ_LOCATION:   'REQ_LOCATION',
  REQ_CONFIRM:    'REQ_CONFIRM',
  CFB_SESSION:  'CLUB_FB_SESSION',
  CFB_RATING:   'CLUB_FB_RATING',
  CFB_COMMENT:  'CLUB_FB_COMMENT',
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
  const text     = message.text?.trim();
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
    await saveClubSession(userId, CLUB_STATE.REQ_SLOT_START, { ...tempData, slots: {}, currentDayIdx: 0 });
    await clubClient.replyMessage(replyToken, [{
      type: 'text',
      text: `✅ 選択曜日：${selected.join('・')}\n\n【${selected[0]}曜日】\n開始時間を入力してください。\n（例：9:00）`,
    }]);
    return;
  }

  if (DAYS.includes(text)) {
    if (!selected.includes(text)) selected.push(text);
    await saveClubSession(userId, CLUB_STATE.REQ_DAYS, { ...tempData, days: selected });
    const remaining = DAYS.filter(d => !selected.includes(d));
    await clubClient.replyMessage(replyToken, [{
      type: 'text',
      text: `✅ 選択中：${selected.join('・')}\n\n他の曜日も追加するか「選択完了」を押してください。`,
      quickReply: qr(remaining.map(d => [d]).concat([['選択完了', '選択完了']])),
    }]);
    return;
  }

  await clubClient.replyMessage(replyToken, [{
    type: 'text', text: 'ボタンから曜日を選択してください。',
    quickReply: qr(DAYS.map(d => [d]).concat([['選択完了', '選択完了']])),
  }]);
}

// ── 各曜日の開始時間 ──
async function handleReqSlotStart(userId, message, replyToken, session) {
  const text = message.text?.trim();
  if (!text) {
    await clubClient.replyMessage(replyToken, [{ type: 'text', text: '開始時間を入力してください。（例：9:00）' }]);
    return;
  }
  const d = session.tempData;
  const currentDay = d.days[d.currentDayIdx];
  await saveClubSession(userId, CLUB_STATE.REQ_SLOT_END, { ...d, currentStart: text });
  await clubClient.replyMessage(replyToken, [{
    type: 'text', text: `【${currentDay}曜日】開始：${text}\n\n終了時間を入力してください。（例：12:00）`,
  }]);
}

// ── 各曜日の終了時間 ──
async function handleReqSlotEnd(userId, message, replyToken, session) {
  const text = message.text?.trim();
  if (!text) {
    await clubClient.replyMessage(replyToken, [{ type: 'text', text: '終了時間を入力してください。（例：12:00）' }]);
    return;
  }
  const d = session.tempData;
  const currentDay = d.days[d.currentDayIdx];
  const newSlots = { ...d.slots, [currentDay]: { start: d.currentStart, end: text } };
  const nextIdx = d.currentDayIdx + 1;

  if (nextIdx >= d.days.length) {
    // 全曜日完了 → 場所入力へ
    await saveClubSession(userId, CLUB_STATE.REQ_LOCATION, { ...d, slots: newSlots });
    await clubClient.replyMessage(replyToken, [{
      type: 'text',
      text: `【${currentDay}曜日】${d.currentStart}〜${text} ✅\n\nコーチ指導の練習場所を入力してください。\n（登録した練習場所と異なる場合も入力してください）`,
    }]);
  } else {
    // 次の曜日へ
    const nextDay = d.days[nextIdx];
    await saveClubSession(userId, CLUB_STATE.REQ_SLOT_START, { ...d, slots: newSlots, currentDayIdx: nextIdx, currentStart: '' });
    await clubClient.replyMessage(replyToken, [{
      type: 'text',
      text: `【${currentDay}曜日】${d.currentStart}〜${text} ✅\n\n【${nextDay}曜日】\n開始時間を入力してください。（例：14:00）`,
    }]);
  }
}

// ── 要請場所 ──
async function handleReqLocation(userId, message, replyToken, session) {
  const location = message.text?.trim();
  if (!location) { await clubClient.replyMessage(replyToken, [{type:'text',text:'練習場所を入力してください。'}]); return; }
  const d = { ...session.tempData, reqLocation: location };
  await saveClubSession(userId, CLUB_STATE.REQ_CONFIRM, d);
  const scheduleText = d.days.map(day => `${day}曜日：${d.slots[day].start}〜${d.slots[day].end}`).join('\n');
  await clubClient.replyMessage(replyToken, [{
    type: 'text',
    text: `【要請内容の確認】\n\nスポーツ：${d.sport}\n\n📅 スケジュール（毎週）\n${scheduleText}\n\n📍 場所：${location}\n\nこの内容で要請しますか？`,
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
  // スケジュールをテキストとJSONで保存
  const scheduleText = d.days.map(day => `${day} ${d.slots[day].start}〜${d.slots[day].end}`).join('・');
  const firstSlot = d.slots[d.days[0]];
  const result = await saveRequest(userId, {
    sport:        d.sport,
    clubName:     d.clubName,
    days:         scheduleText,
    startTime:    firstSlot.start,
    endTime:      firstSlot.end,
    reqLocation:  d.reqLocation,
    slotsJson:    JSON.stringify(d.slots),
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
  const scheduleText = d.days.map(day => `${day}曜日 ${d.slots[day].start}〜${d.slots[day].end}`).join('\n');
  await cc.pushMessage(adminId, [
    {
      type: 'text',
      text: `📋 新しいコーチ要請\n\n要請番号：${requestId}\n団体名：${d.clubName}\nスポーツ：${d.sport}\n\n📅 スケジュール（毎週）\n${scheduleText}\n\n📍 場所：${d.reqLocation}`,
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

// ── フィードバック：開始 ──
async function startClubFeedback(userId, replyToken, testMode = false) {
  // テストモード：全チェックをスキップ
  if (testMode) {
    await saveClubSession(userId, CLUB_STATE.CFB_RATING, { cfbClubName: 'テストクラブ', cfbRequest: null, cfbTestMode: true });
    await clubClient.replyMessage(replyToken, [{
      type: 'text',
      text: '⭐ フィードバック送信（テストモード）\n\n今回の指導を5段階で評価してください。',
      quickReply: qr([['⭐ 1','1'],['⭐⭐ 2','2'],['⭐⭐⭐ 3','3'],['⭐⭐⭐⭐ 4','4'],['⭐⭐⭐⭐⭐ 5','5']]),
    }]);
    return;
  }

  const club = await getClub(userId);
  if (!club || !club.userId) {
    await clubClient.replyMessage(replyToken, [{ type: 'text', text: 'フィードバックはクラブ登録後に送ることができます。' }]);
    return;
  }

  const requests = await getRequestsByClub(userId);
  if (!requests || requests.length === 0) {
    await clubClient.replyMessage(replyToken, [{
      type: 'text',
      text: '現在マッチング中のコーチがいないため、フィードバックを送ることができません。',
    }]);
    return;
  }

  if (requests.length === 1) {
    const r = requests[0];
    await saveClubSession(userId, CLUB_STATE.CFB_RATING, {
      cfbClubName: club.name,
      cfbRequest: { requestId: r.requestId, coachName: r.coachName, coachUserId: r.coachUserId, sport: r.sport, days: r.days, startTime: r.startTime, endTime: r.endTime },
    });
    await clubClient.replyMessage(replyToken, [{
      type: 'text',
      text: `⭐ フィードバック送信\n\nコーチ：${r.coachName}（${r.days} ${r.startTime}〜${r.endTime}）\n\n今回の指導を5段階で評価してください。`,
      quickReply: qr([['⭐ 1','1'],['⭐⭐ 2','2'],['⭐⭐⭐ 3','3'],['⭐⭐⭐⭐ 4','4'],['⭐⭐⭐⭐⭐ 5','5']]),
    }]);
    return;
  }

  const sessionList = requests.map((r, i) =>
    `${i + 1}. ${r.coachName}（${r.days} ${r.startTime}〜${r.endTime}）`
  ).join('\n');
  await saveClubSession(userId, CLUB_STATE.CFB_SESSION, { cfbClubName: club.name, cfbRequests: requests });
  await clubClient.replyMessage(replyToken, [{
    type: 'text',
    text: `フィードバックを送るコーチを選んでください：\n\n${sessionList}`,
    quickReply: qr(requests.slice(0, 12).map((r, i) => [`${i + 1}. ${r.coachName}`, String(i + 1)])),
  }]);
}

// ── フィードバック：セッション選択 ──
async function handleCfbSession(userId, message, replyToken, session) {
  const idx = parseInt(message.text?.trim(), 10) - 1;
  const requests = session.tempData.cfbRequests || [];
  if (isNaN(idx) || idx < 0 || idx >= requests.length) {
    await clubClient.replyMessage(replyToken, [{
      type: 'text', text: '番号をボタンから選んでください。',
      quickReply: qr(requests.slice(0, 12).map((r, i) => [`${i + 1}. ${r.coachName}`, String(i + 1)])),
    }]);
    return;
  }
  const r = requests[idx];
  await saveClubSession(userId, CLUB_STATE.CFB_RATING, {
    ...session.tempData,
    cfbRequest: { requestId: r.requestId, coachName: r.coachName, coachUserId: r.coachUserId, sport: r.sport, days: r.days, startTime: r.startTime, endTime: r.endTime },
  });
  await clubClient.replyMessage(replyToken, [{
    type: 'text',
    text: `⭐ フィードバック送信\n\nコーチ：${r.coachName}（${r.days} ${r.startTime}〜${r.endTime}）\n\n今回の指導を5段階で評価してください。`,
    quickReply: qr([['⭐ 1','1'],['⭐⭐ 2','2'],['⭐⭐⭐ 3','3'],['⭐⭐⭐⭐ 4','4'],['⭐⭐⭐⭐⭐ 5','5']]),
  }]);
}

// ── フィードバック：評価 ──
async function handleCfbRating(userId, message, replyToken, session) {
  const rating = parseInt(message.text?.trim(), 10);
  if (isNaN(rating) || rating < 1 || rating > 5) {
    await clubClient.replyMessage(replyToken, [{
      type: 'text', text: '1〜5の数字をボタンから選んでください。',
      quickReply: qr([['⭐ 1','1'],['⭐⭐ 2','2'],['⭐⭐⭐ 3','3'],['⭐⭐⭐⭐ 4','4'],['⭐⭐⭐⭐⭐ 5','5']]),
    }]);
    return;
  }
  await saveClubSession(userId, CLUB_STATE.CFB_COMMENT, { ...session.tempData, cfbRating: rating });
  await clubClient.replyMessage(replyToken, [{
    type: 'text',
    text: `評価：${'⭐'.repeat(rating)}（${rating}）\n\nコメントがあれば入力してください。\n（スキップする場合は「スキップ」と送信）`,
  }]);
}

// ── フィードバック：コメント ──
async function handleCfbComment(userId, message, replyToken, session) {
  const comment = message.text?.trim() === 'スキップ' ? '' : message.text?.trim();
  const d = session.tempData;
  const r = d.cfbRequest;

  await saveClubFeedback(userId, {
    clubName: d.cfbClubName, rating: d.cfbRating, comment,
    coachName: r?.coachName || '', coachUserId: r?.coachUserId || '',
    requestId: r?.requestId || '', testMode: d.cfbTestMode || false,
  });

  // 管理者通知（クラブ管理者）
  const adminId = config.clubAdminUserId;
  if (adminId) {
    const bodyRows = [
      { type: 'box', layout: 'horizontal', margin: 'sm', contents: [
        { type: 'text', text: 'クラブ名', size: 'sm', color: '#777777', flex: 2 },
        { type: 'text', text: d.cfbClubName, size: 'sm', color: '#111111', flex: 4, wrap: true },
      ]},
      ...(r ? [
        { type: 'box', layout: 'horizontal', margin: 'sm', contents: [
          { type: 'text', text: 'コーチ名', size: 'sm', color: '#777777', flex: 2 },
          { type: 'text', text: r.coachName, size: 'sm', color: '#111111', flex: 4, wrap: true },
        ]},
        { type: 'box', layout: 'horizontal', margin: 'sm', contents: [
          { type: 'text', text: '曜日・時間', size: 'sm', color: '#777777', flex: 2 },
          { type: 'text', text: `${r.days} ${r.startTime}〜${r.endTime}`, size: 'sm', color: '#111111', flex: 4, wrap: true },
        ]},
      ] : [{ type: 'box', layout: 'horizontal', margin: 'sm', contents: [
        { type: 'text', text: 'コーチ', size: 'sm', color: '#777777', flex: 2 },
        { type: 'text', text: '（テストモード・未選択）', size: 'sm', color: '#111111', flex: 4, wrap: true },
      ]}]),
      { type: 'box', layout: 'horizontal', margin: 'sm', contents: [
        { type: 'text', text: '評価', size: 'sm', color: '#777777', flex: 2 },
        { type: 'text', text: '⭐'.repeat(d.cfbRating) + `（${d.cfbRating}/5）`, size: 'sm', color: '#111111', flex: 4, wrap: true },
      ]},
      { type: 'box', layout: 'horizontal', margin: 'sm', contents: [
        { type: 'text', text: 'コメント', size: 'sm', color: '#777777', flex: 2 },
        { type: 'text', text: comment || '（なし）', size: 'sm', color: '#111111', flex: 4, wrap: true },
      ]},
      { type: 'text', text: `LINE ID: ${userId}`, size: 'xxs', color: '#aaaaaa', margin: 'md', wrap: true },
    ];
    await clubClient.pushMessage(adminId, [{
      type: 'flex', altText: `【クラブFB】${d.cfbClubName}`,
      contents: {
        type: 'bubble',
        header: {
          type: 'box', layout: 'vertical', backgroundColor: '#6a4c93',
          contents: [
            { type: 'text', text: '📝 クラブからのフィードバック', weight: 'bold', size: 'lg', color: '#ffffff' },
            ...(d.cfbTestMode ? [{ type: 'text', text: '※テストモード', size: 'xs', color: '#e0d0ff' }] : []),
          ],
        },
        body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: bodyRows },
      },
    }]);
  }

  await saveClubSession(userId, CLUB_STATE.REGISTERED, {});
  await clubClient.replyMessage(replyToken, [{
    type: 'text',
    text: `✅ フィードバックを送信しました。\n\n評価：${'⭐'.repeat(d.cfbRating)}（${d.cfbRating}/5）${comment ? `\nコメント：${comment}` : ''}\n\nありがとうございました！`,
  }]);
}

// ── 問い合わせ ──
async function handleClubInquiry(userId, replyToken) {
  await clubClient.replyMessage(replyToken, [{
    type: 'flex',
    altText: 'お問い合わせ',
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical',
        contents: [{ type: 'text', text: 'お問い合わせ', weight: 'bold', size: 'xl', color: '#333333' }],
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'md',
        contents: [
          { type: 'text', text: 'お電話はこちら', size: 'xs', color: '#888888' },
          { type: 'text', text: '080-8089-0670', weight: 'bold', size: 'lg', color: '#1DB446' },
          { type: 'text', text: '受付時間：10:00〜20:00', size: 'xs', color: '#888888' },
          { type: 'separator', margin: 'md' },
          { type: 'text', text: 'LINEでのご質問', weight: 'bold', size: 'sm', color: '#333333', margin: 'md' },
          { type: 'text', text: 'このトーク画面にメッセージを送っていただければ、担当者が確認次第ご返信いたします。', size: 'xs', color: '#555555', wrap: true },
        ],
      },
      footer: {
        type: 'box', layout: 'vertical',
        contents: [{
          type: 'button', style: 'primary', color: '#1DB446',
          action: { type: 'uri', label: '電話をかける', uri: 'tel:080-8089-0670' },
        }],
      },
    },
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
  handleReqSlotStart,
  handleReqSlotEnd,
  handleReqLocation,
  handleReqConfirm,
  handleClubInquiry,
  startClubFeedback,
  handleCfbSession,
  handleCfbRating,
  handleCfbComment,
};
