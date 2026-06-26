require('dotenv').config();
const express = require('express');
const { middleware, client, getImageBuffer } = require('./lineClient');
const { getSession }                         = require('./gasClient');
const {
  handleFollow, startRegistration,
  handleName, handleAge, handleSport,
  handleStudentId, handleTournamentName, handleTournamentProof,
  handleConfirmInput, handleMatchingCheck, handleInquiry, handleDetails,
} = require('./flow');
const { handlePostback }   = require('./admin');
const { resendCertificate } = require('./certificate');
const config               = require('./config');

const { STATE } = config;
const app  = express();
const PORT = process.env.PORT || 3000;

// ── ヘルスチェック ──
app.get('/', (req, res) => res.send('LINE Coach Bot ✅'));

// ── 画像確認エンドポイント（管理者が申請確認時に使用） ──
app.get('/image', async (req, res) => {
  if (req.query.secret !== config.adminImageSecret) {
    return res.status(403).send('Forbidden');
  }
  try {
    const buffer = await getImageBuffer(req.query.msgId);
    res.set('Content-Type', 'image/jpeg');
    res.send(buffer);
  } catch {
    res.status(404).send('Image not found or expired');
  }
});

// ── LINE Webhook ──
app.post('/webhook', middleware, (req, res) => {
  res.json({ status: 'ok' }); // LINEに即レスポンス
  (req.body.events || []).forEach(event =>
    handleEvent(event).catch(err => console.error('Event error:', err))
  );
});

async function handleEvent(event) {
  const userId = event.source.userId;

  if (event.type === 'follow') {
    await handleFollow(userId);
    return;
  }
  if (event.type === 'postback') {
    await handlePostback(userId, event.postback.data, event.replyToken);
    return;
  }
  if (event.type !== 'message') return;

  // リッチメニューキーワードを最優先
  if (event.message.type === 'text') {
    const t = event.message.text;
    if (t === 'コーチ登録する' || t === '応募') { await startRegistration(userId, event.replyToken); return; }
    if (t === '詳細')           { await handleDetails(userId, event.replyToken); return; }
    if (t === '登録証を見る')   { await resendCertificate(userId, event.replyToken); return; }
    if (t === 'マッチング確認') { await handleMatchingCheck(userId, event.replyToken); return; }
    if (t === 'お問い合わせ' || t === '問い合わせ') { await handleInquiry(userId, event.replyToken); return; }
  }

  // 登録フロー
  const session = await getSession(userId);
  const state   = session?.state || STATE.NONE;

  const handlers = {
    [STATE.NAME]:             handleName,
    [STATE.AGE]:              handleAge,
    [STATE.SPORT]:            handleSport,
    [STATE.STUDENT_ID]:       handleStudentId,
    [STATE.TOURNAMENT_NAME]:  handleTournamentName,
    [STATE.TOURNAMENT_PROOF]: handleTournamentProof,
    [STATE.CONFIRM]:          handleConfirmInput,
  };

  if (handlers[state]) {
    await handlers[state](userId, event.message, event.replyToken, session);
  } else if (state === STATE.PENDING) {
    await client.replyMessage(event.replyToken, [{ type: 'text', text: '現在審査中です。しばらくお待ちください。' }]);
  } else if (state === STATE.APPROVED) {
    await client.replyMessage(event.replyToken, [{ type: 'text', text: 'メニューからご利用ください。' }]);
  } else {
    await client.replyMessage(event.replyToken, [{ type: 'text', text: '下のメニューから「コーチ登録する」を選択してください。' }]);
  }
}

app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
