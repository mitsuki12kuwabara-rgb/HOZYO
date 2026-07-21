const { clubClient }                       = require('./clubClient');
const { client }                           = require('./lineClient');
const { getRequest, updateRequest, endMatch,
        getCoachesBySport, getClub, getUser } = require('./gasClient');
const config                               = require('./config');

function parsePostback(data) {
  return Object.fromEntries(
    data.split('&').map(pair => {
      const [k, v] = pair.split('=');
      return [k, decodeURIComponent(v || '')];
    })
  );
}

async function handleClubPostback(userId, data, replyToken) {
  if (userId !== config.clubAdminUserId) {
    await clubClient.replyMessage(replyToken, [{type:'text',text:'この操作は管理者のみ使用できます。'}]);
    return;
  }
  const p = parsePostback(data);
  if (p.action === 'list_coaches') await listCoaches(p, replyToken);
  if (p.action === 'club_match')   await doMatch(p, replyToken);
  if (p.action === 'end_match')    await doEndMatch(p, replyToken);
}

// ── コーチ一覧を管理者に送る ──
async function listCoaches({ requestId, sport, clubUserId }, replyToken) {
  const coaches = await getCoachesBySport(sport);
  if (!coaches || coaches.length === 0) {
    await clubClient.replyMessage(replyToken, [{
      type: 'text', text: `${sport}の登録コーチがいません。`,
    }]);
    return;
  }

  const request = await getRequest(requestId);
  const bubbles = coaches.map(coach => ({
    type: 'bubble',
    body: { type: 'box', layout: 'vertical', contents: [
      { type: 'text', text: coach.name,          weight: 'bold', size: 'lg' },
      { type: 'text', text: `登録番号: ${coach.regNo}`, size: 'sm', color: '#666666' },
      { type: 'text', text: `スポーツ: ${coach.sport}`, size: 'sm', margin: 'sm' },
    ]},
    footer: { type: 'box', layout: 'vertical', contents: [{
      type: 'button', style: 'primary', color: '#1DB446',
      action: {
        type: 'postback', label: 'このコーチでマッチング',
        data: `action=club_match&requestId=${requestId}&coachUserId=${coach.userId}&clubUserId=${clubUserId}`,
      },
    }]},
  }));

  await clubClient.replyMessage(replyToken, [{
    type: 'flex', altText: 'コーチ一覧',
    contents: { type: 'carousel', contents: bubbles },
  }]);
}

// ── マッチング実行 ──
async function doMatch({ requestId, coachUserId, clubUserId }, replyToken) {
  const [request, coach, club] = await Promise.all([
    getRequest(requestId),
    getUser(coachUserId),
    getClub(clubUserId),
  ]);

  if (!request || !coach || !club) {
    await clubClient.replyMessage(replyToken, [{type:'text',text:'データが見つかりませんでした。'}]);
    return;
  }

  await updateRequest(requestId, 'MATCHED', coachUserId);

  // コーチへ通知（コーチ側LINE）
  await client.pushMessage(coachUserId, [{
    type: 'text',
    text: `🎉 マッチング成立！\n\n【クラブ情報】\n団体名：${club.name}\nスポーツ：${club.sport}\n指導対象：${club.age}\n\n【指導内容】\n曜日：${request.days}\n時間：${request.startTime}〜${request.endTime}\n場所：${request.reqLocation}\n\n詳細は担当者よりご連絡します。`,
  }]);

  // クラブへ通知（クラブ側LINE）
  await clubClient.pushMessage(clubUserId, [{
    type: 'text',
    text: `🎉 マッチング成立！\n\n【コーチ情報】\n氏名：${coach.name}\n登録番号：${coach.regNo}\nスポーツ：${coach.sport}\n\n【指導内容】\n曜日：${request.days}\n時間：${request.startTime}〜${request.endTime}\n場所：${request.reqLocation}\n\n詳細は担当者よりご連絡します。`,
  }]);

  await clubClient.replyMessage(replyToken, [{
    type: 'text',
    text: `✅ マッチング完了！\nコーチ：${coach.name}\nクラブ：${club.name}\n両者に通知しました。`,
  }]);
}

// ── マッチング終了承認 ──
async function doEndMatch({ requestId, coachUserId }, replyToken) {
  const [request, coach] = await Promise.all([
    getRequest(requestId),
    getUser(coachUserId),
  ]);

  if (!request) {
    await clubClient.replyMessage(replyToken, [{ type: 'text', text: '要請データが見つかりませんでした。' }]);
    return;
  }

  const club = await getClub(request.clubUserId);

  await endMatch(requestId);

  const msg = 'これまでのご協力ありがとうございました。\nまたのご利用をお待ちしております。\n\nご不明な点は「お問い合わせ」よりご連絡ください。';

  if (coach) {
    await client.pushMessage(coach.userId, [{
      type: 'text',
      text: `【マッチング終了のお知らせ】\n\n${club?.name || ''} とのマッチングが終了しました。\n\n${msg}`,
    }]);
  }
  if (club) {
    await clubClient.pushMessage(club.userId, [{
      type: 'text',
      text: `【マッチング終了のお知らせ】\n\n${coach?.name || ''} コーチとのマッチングが終了しました。\n\n${msg}`,
    }]);
  }

  await clubClient.replyMessage(replyToken, [{
    type: 'text',
    text: `✅ マッチングを終了しました。\nコーチ：${coach?.name || coachUserId}\nクラブ：${club?.name || request.clubUserId}\n両者に通知しました。`,
  }]);
}

module.exports = { handleClubPostback };
