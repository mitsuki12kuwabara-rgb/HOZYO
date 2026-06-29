require('dotenv').config();
const express = require('express');
const { middleware, client, getImageBuffer } = require('./lineClient');
const { getSession }                         = require('./gasClient');
const {
  handleFollow, startRegistration,
  handleName, handleAge, handleSport,
  handleHeightWeight, handlePlaying, handleCareer,
  handleStudentId, handleQualType, handleTournamentName, handleTournamentProof,
  handleConfirmInput, handleMatchingCheck, handleInquiry, handleDetails,
  handleShiftDays, handleShiftSlot, handleShiftConfirm,
  startAbsenceReport, handleReportSession, handleReportDate,
  handleReportReason, handleReportConfirm,
  startFeedback, handleFbSession, handleFbRating, handleFbComment,
} = require('./flow');
const { handlePostback }    = require('./admin');
const { resendCertificate } = require('./certificate');
const { clubMiddleware, clubClient } = require('./clubClient');
const { handleClubPostback }        = require('./clubAdmin');
const {
  CLUB_STATE,
  handleClubFollow, startClubRegistration,
  handleClubName, handleClubSport, handleClubLocation,
  handleClubAge, handleClubConfirm,
  startRequest, handleReqDays, handleReqStart,
  handleReqEnd, handleReqLocation, handleReqConfirm,
  handleClubInquiry,
  startClubFeedback, handleCfbSession, handleCfbRating, handleCfbComment,
} = require('./clubFlow');
const { getClubSession }    = require('./gasClient');
const config                = require('./config');

const { STATE } = config;
const app  = express();
const PORT = process.env.PORT || 3000;

// ── ヘルスチェック ──
app.get('/', (req, res) => res.send('LINE Coach Bot ✅'));

// ── リッチメニューID確認（管理者用） ──
app.get('/richmenu-list', async (req, res) => {
  if (req.query.secret !== config.adminImageSecret) return res.status(403).send('Forbidden');
  const { getRichMenuList } = require('./lineClient');
  const list = await getRichMenuList();
  res.json(list);
});

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
    if (t === '詳細')                 { await handleDetails(userId, event.replyToken); return; }
    if (t === '登録証を見る')         { await resendCertificate(userId, event.replyToken); return; }
    if (t === 'マッチング確認')       { await handleMatchingCheck(userId, event.replyToken); return; }
    if (t === 'お問い合わせ' || t === '問い合わせ') { await handleInquiry(userId, event.replyToken); return; }
    if (t === '都合が悪い日を報告')   { await startAbsenceReport(userId, event.replyToken); return; }
    if (t === 'フィードバックを送る') { await startFeedback(userId, event.replyToken, false); return; }
    if (t === 'フィードバックテスト') { await startFeedback(userId, event.replyToken, true); return; }
  }

  // 登録フロー
  const session = await getSession(userId);
  const state   = session?.state || STATE.NONE;

  const handlers = {
    [STATE.NAME]:             handleName,
    [STATE.AGE]:              handleAge,
    [STATE.SPORT]:            handleSport,
    [STATE.HEIGHT_WEIGHT]:    handleHeightWeight,
    [STATE.PLAYING]:          handlePlaying,
    [STATE.CAREER]:           handleCareer,
    [STATE.STUDENT_ID]:       handleStudentId,
    [STATE.QUAL_TYPE]:        handleQualType,
    [STATE.TOURNAMENT_NAME]:  handleTournamentName,
    [STATE.TOURNAMENT_PROOF]: handleTournamentProof,
    [STATE.CONFIRM]:          handleConfirmInput,
    [STATE.SHIFT_DAYS]:       handleShiftDays,
    [STATE.SHIFT_SLOT]:       handleShiftSlot,
    [STATE.SHIFT_CONFIRM]:    handleShiftConfirm,
    [STATE.REPORT_SESSION]:   handleReportSession,
    [STATE.REPORT_DATE]:      handleReportDate,
    [STATE.REPORT_REASON]:    handleReportReason,
    [STATE.REPORT_CONFIRM]:   handleReportConfirm,
    [STATE.FB_SESSION]:       handleFbSession,
    [STATE.FB_RATING]:        handleFbRating,
    [STATE.FB_COMMENT]:       handleFbComment,
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

// ── クラブ Webhook ──
app.post('/webhook-club', clubMiddleware, (req, res) => {
  res.json({ status: 'ok' });
  (req.body.events || []).forEach(event =>
    handleClubEvent(event).catch(err => console.error('Club event error:', err))
  );
});

async function handleClubEvent(event) {
  const userId = event.source.userId;

  if (event.type === 'follow') { await handleClubFollow(userId); return; }
  if (event.type === 'postback') { await handleClubPostback(userId, event.postback.data, event.replyToken); return; }
  if (event.type !== 'message') return;

  if (event.message.type === 'text') {
    const t = event.message.text;
    if (t === 'クラブ登録する') { await startClubRegistration(userId, event.replyToken); return; }
    if (t === 'コーチを要請する') { await startRequest(userId, event.replyToken); return; }
    if (t === 'お問い合わせ' || t === '問い合わせ') { await handleClubInquiry(userId, event.replyToken); return; }
    if (t === 'フィードバックを送る') { await startClubFeedback(userId, event.replyToken, false); return; }
    if (t === 'フィードバックテスト') { await startClubFeedback(userId, event.replyToken, true); return; }
  }

  const session = await getClubSession(userId);
  const state   = session?.state || CLUB_STATE.NONE;

  const handlers = {
    [CLUB_STATE.NAME]:         handleClubName,
    [CLUB_STATE.SPORT]:        handleClubSport,
    [CLUB_STATE.LOCATION]:     handleClubLocation,
    [CLUB_STATE.AGE]:          handleClubAge,
    [CLUB_STATE.CONFIRM]:      handleClubConfirm,
    [CLUB_STATE.REQ_DAYS]:     handleReqDays,
    [CLUB_STATE.REQ_START]:    handleReqStart,
    [CLUB_STATE.REQ_END]:      handleReqEnd,
    [CLUB_STATE.REQ_LOCATION]: handleReqLocation,
    [CLUB_STATE.REQ_CONFIRM]:  handleReqConfirm,
    [CLUB_STATE.CFB_SESSION]:  handleCfbSession,
    [CLUB_STATE.CFB_RATING]:   handleCfbRating,
    [CLUB_STATE.CFB_COMMENT]:  handleCfbComment,
  };

  if (handlers[state]) {
    await handlers[state](userId, event.message, event.replyToken, session);
  } else {
    await clubClient.replyMessage(event.replyToken, [{
      type: 'text', text: '「クラブ登録する」または「コーチを要請する」と送信してください。',
    }]);
  }
}

app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
