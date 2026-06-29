const { client, linkRichMenu }         = require('./lineClient');
const { getUser, updateStatus,
        saveSession, deleteSession }   = require('./gasClient');
const { sendCertificate }             = require('./certificate');
const config                          = require('./config');

function parsePostback(data) {
  return Object.fromEntries(
    data.split('&').map(pair => {
      const [k, v] = pair.split('=');
      return [k, decodeURIComponent(v || '')];
    })
  );
}

async function handlePostback(userId, data, replyToken) {
  if (userId !== config.adminUserId) {
    await client.replyMessage(replyToken, [{ type: 'text', text: 'この操作は管理者のみ使用できます。' }]);
    return;
  }
  const p = parsePostback(data);
  if (p.action === 'interview') await requestInterview(p, replyToken);
  if (p.action === 'approve')   await approveUser(p, replyToken);
  if (p.action === 'reject')    await rejectUser(p, replyToken);
}

async function requestInterview({ userId, regNo, name }, adminReplyToken) {
  try {
    // コーチへ面接依頼を通知
    await client.pushMessage(userId, [{
      type: 'text',
      text: `${name} さん、書類審査を通過しました🎉\n\nオンライン面接のご案内をお送りします。\n担当者から直接このLINEにてご連絡しますので、しばらくお待ちください。`,
    }]);
    // 管理者へ承認/却下の第2カードを送信
    await client.replyMessage(adminReplyToken, [{
      type: 'flex',
      altText: `【面接後】${name} さんの最終審査`,
      contents: {
        type: 'bubble',
        header: {
          type: 'box', layout: 'vertical', backgroundColor: '#0077b6',
          contents: [{ type: 'text', text: `🎤 面接実施済み：${name}`, weight: 'bold', size: 'md', color: '#ffffff', wrap: true }],
        },
        body: {
          type: 'box', layout: 'vertical', spacing: 'sm',
          contents: [
            { type: 'text', text: '面接を踏まえて最終判断してください。', wrap: true, size: 'sm', color: '#333333' },
            { type: 'text', text: `登録番号: ${regNo}`, size: 'xs', color: '#aaaaaa', margin: 'md' },
          ],
        },
        footer: {
          type: 'box', layout: 'horizontal', spacing: 'sm', paddingAll: '12px',
          contents: [
            {
              type: 'button', style: 'primary', color: '#1DB446', flex: 1,
              action: {
                type: 'postback', label: '✅ 承認する',
                data: `action=approve&userId=${userId}&regNo=${encodeURIComponent(regNo)}&name=${encodeURIComponent(name)}`,
              },
            },
            {
              type: 'button', style: 'secondary', flex: 1,
              action: {
                type: 'postback', label: '❌ 却下する',
                data: `action=reject&userId=${userId}&name=${encodeURIComponent(name)}`,
              },
            },
          ],
        },
      },
    }]);
  } catch (err) {
    console.error('requestInterview error:', err);
    await client.replyMessage(adminReplyToken, [{ type: 'text', text: `エラー：${err.message}` }]);
  }
}

async function approveUser({ userId, regNo, name }, adminReplyToken) {
  try {
    const user = await getUser(userId);
    if (!user) {
      await client.replyMessage(adminReplyToken, [{ type: 'text', text: 'ユーザーが見つかりません。' }]);
      return;
    }
    if (user.status === config.STATE.APPROVED) {
      await client.replyMessage(adminReplyToken, [{ type: 'text', text: 'すでに承認済みです。' }]);
      return;
    }

    await updateStatus(userId, config.STATE.APPROVED, new Date().toISOString());
    await saveSession(userId, config.STATE.APPROVED, {});

    // 登録済みリッチメニューに切り替え
    const registeredMenuId = process.env.REGISTERED_RICH_MENU_ID;
    if (registeredMenuId) {
      await linkRichMenu(userId, registeredMenuId).catch(e => console.error('linkRichMenu:', e));
    }

    await sendCertificate(userId, { ...user, regNo: regNo || user.regNo });
    await client.replyMessage(adminReplyToken, [{
      type: 'text', text: `✅ ${name || user.name} さんを承認しました。\n登録証を送付しました。`,
    }]);
  } catch (err) {
    console.error('approveUser error:', err);
    await client.replyMessage(adminReplyToken, [{ type: 'text', text: `エラー：${err.message}` }]);
  }
}

async function rejectUser({ userId, name }, adminReplyToken) {
  try {
    const user = await getUser(userId);
    if (!user) {
      await client.replyMessage(adminReplyToken, [{ type: 'text', text: 'ユーザーが見つかりません。' }]);
      return;
    }
    await updateStatus(userId, config.STATE.REJECTED, '');
    await deleteSession(userId);

    await client.pushMessage(userId, [{
      type: 'text',
      text: '申し訳ありません。\n\n登録審査の結果、今回はご登録をお断りさせていただきました。\n\nご不明な点は「お問い合わせ」よりご連絡ください。',
    }]);
    await client.replyMessage(adminReplyToken, [{
      type: 'text', text: `❌ ${name || user.name} さんを却下しました。`,
    }]);
  } catch (err) {
    console.error('rejectUser error:', err);
    await client.replyMessage(adminReplyToken, [{ type: 'text', text: `エラー：${err.message}` }]);
  }
}

module.exports = { handlePostback };
