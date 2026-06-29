const { client } = require('./lineClient');

function today() {
  const d = new Date();
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
}
function expireDate() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
}
function certRow(label, value) {
  return {
    type: 'box', layout: 'horizontal', paddingTop: '6px',
    contents: [
      { type: 'text', text: label, size: 'sm', color: '#888888', flex: 2 },
      { type: 'text', text: String(value), size: 'sm', color: '#111111',
        flex: 3, align: 'end', weight: 'bold' },
    ],
  };
}

function buildCertFlex(user) {
  const colorMap = { 'バスケットボール': '#e05c2a', 'サッカー': '#2a7ae0', '野球': '#8e1f1f' };
  const emojiMap = { 'バスケットボール': '🏀', 'サッカー': '⚽', '野球': '⚾' };
  const color = colorMap[user.sport] || '#1DB446';
  const emoji = emojiMap[user.sport] || '🏅';

  return {
    type: 'flex',
    altText: `【登録証】${user.name} さんのコーチ登録が承認されました`,
    contents: {
      type: 'bubble', size: 'mega',
      header: {
        type: 'box', layout: 'vertical', paddingAll: '20px',
        backgroundColor: color,
        contents: [
          { type: 'text', text: `${emoji} コーチ登録証`,
            weight: 'bold', size: 'xl', color: '#ffffff', align: 'center' },
          { type: 'text', text: 'Coach Registration Certificate',
            size: 'xxs', color: '#ffffff', align: 'center', margin: 'sm' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '20px',
        contents: [
          { type: 'text', text: user.name, weight: 'bold', size: 'xxl', align: 'center', margin: 'md' },
          { type: 'text', text: `${user.sport} コーチ`, size: 'md',
            align: 'center', color: '#666666', margin: 'sm' },
          {
            type: 'box', layout: 'vertical', margin: 'xl',
            backgroundColor: '#f8f8f8', cornerRadius: '8px', paddingAll: '14px',
            contents: [
              certRow('登録番号', user.regNo),
              certRow('登録日',   today()),
              certRow('有効期限', expireDate()),
              certRow('スポーツ', user.sport),
            ],
          },
          ...(user.shifts ? (() => {
            const shifts = typeof user.shifts === 'string' ? JSON.parse(user.shifts) : user.shifts;
            const entries = Object.entries(shifts);
            if (entries.length === 0) return [];
            return [
              { type: 'separator', margin: 'xl' },
              { type: 'text', text: '📅 対応シフト', weight: 'bold', size: 'sm', margin: 'lg', color: '#444444' },
              ...entries.map(([day, slots]) => certRow(`${day}曜日`, slots.join('、'))),
            ];
          })() : []),
          { type: 'separator', margin: 'xl' },
          { type: 'text', text: '全国大会出場経験 認定コーチ',
            size: 'sm', color: '#888888', align: 'center', margin: 'lg' },
          { type: 'text', text: '※ スクリーンショットして保管してください',
            size: 'xxs', color: '#aaaaaa', align: 'center', margin: 'sm' },
        ],
      },
    },
  };
}

async function sendCertificate(userId, user) {
  await client.pushMessage(userId, [
    {
      type: 'text',
      text: `🎉 登録が承認されました！\n\nようこそ、${user.name} さん！\n\n` +
            `以下があなたの登録証です。\nスクリーンショットして保管してください。`,
    },
    buildCertFlex(user),
  ]);
}

async function resendCertificate(userId, replyToken) {
  const { getUser } = require('./gasClient');
  const config = require('./config');
  const user = await getUser(userId);
  if (!user || user.status !== config.STATE.APPROVED) {
    await client.replyMessage(replyToken, [{ type: 'text', text: '登録証が見つかりません。お問い合わせください。' }]);
    return;
  }
  await client.replyMessage(replyToken, [
    { type: 'text', text: '登録証を表示します。' },
    buildCertFlex(user),
  ]);
}

module.exports = { sendCertificate, resendCertificate };
