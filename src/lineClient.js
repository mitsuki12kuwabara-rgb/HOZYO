const line   = require('@line/bot-sdk');
const axios  = require('axios');
const config = require('./config');

const lineConfig = {
  channelAccessToken: config.line.channelAccessToken,
  channelSecret:      config.line.channelSecret,
};

const client     = new line.Client(lineConfig);
const middleware = line.middleware(lineConfig);

// ユーザーが送った画像をBufferで取得
async function getImageBuffer(messageId) {
  const stream = await client.getMessageContent(messageId);
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data',  chunk => chunks.push(Buffer.from(chunk)));
    stream.on('end',   ()    => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

// リッチメニュー画像アップロード
async function uploadRichMenuImage(richMenuId, buffer) {
  await axios.post(
    `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`,
    buffer,
    {
      headers: {
        Authorization:  `Bearer ${config.line.channelAccessToken}`,
        'Content-Type': 'image/png',
      },
      maxBodyLength: Infinity,
    }
  );
}

module.exports = {
  client,
  middleware,
  getImageBuffer,
  uploadRichMenuImage,
  linkRichMenu:       (userId, id) => client.linkRichMenuToUser(userId, id),
  unlinkRichMenu:     (userId)     => client.unlinkRichMenuFromUser(userId),
  createRichMenu:     (body)       => client.createRichMenu(body),
  setDefaultRichMenu: (id)         => client.setDefaultRichMenu(id),
  getRichMenuList:    ()           => client.getRichMenuList(),
  deleteRichMenu:     (id)         => client.deleteRichMenu(id),
};
