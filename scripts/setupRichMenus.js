// リッチメニュー自動作成スクリプト
// 実行: node scripts/setupRichMenus.js
require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!TOKEN) {
  console.error('LINE_CHANNEL_ACCESS_TOKEN が設定されていません。');
  console.error('.envファイルを作成するか、環境変数を設定してください。');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
};

// ── リッチメニュー定義 ──

const defaultMenu = {
  size: { width: 2500, height: 843 },
  selected: true,
  name: '登録前メニュー',
  chatBarText: 'メニュー',
  areas: [
    {
      bounds: { x: 0, y: 0, width: 833, height: 843 },
      action: { type: 'message', label: '応募', text: 'コーチ登録する' },
    },
    {
      bounds: { x: 833, y: 0, width: 834, height: 843 },
      action: { type: 'message', label: '詳細', text: '詳細' },
    },
    {
      bounds: { x: 1667, y: 0, width: 833, height: 843 },
      action: { type: 'message', label: '問い合わせ', text: '問い合わせ' },
    },
  ],
};

const registeredMenu = {
  size: { width: 2500, height: 843 },
  selected: true,
  name: '登録後メニュー',
  chatBarText: 'メニュー',
  areas: [
    {
      bounds: { x: 0, y: 0, width: 833, height: 843 },
      action: { type: 'message', label: '登録証', text: '登録証を見る' },
    },
    {
      bounds: { x: 833, y: 0, width: 834, height: 843 },
      action: { type: 'message', label: 'マッチング', text: 'マッチング確認' },
    },
    {
      bounds: { x: 1667, y: 0, width: 833, height: 843 },
      action: { type: 'message', label: '問い合わせ', text: '問い合わせ' },
    },
  ],
};

// ── シンプルなPNG画像を生成（黄色ベース） ──
function makeSimplePng(width, height, r, g, b) {
  const zlib = require('zlib');
  const crc32 = (buf) => {
    let c = 0xFFFFFFFF;
    const table = new Uint32Array(256).map((_, n) => {
      for (let k = 0; k < 8; k++) n = (n & 1) ? (0xEDB88320 ^ (n >>> 1)) : (n >>> 1);
      return n;
    });
    for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };
  const chunk = (type, data) => {
    const t = Buffer.from(type);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; // bit depth, color type RGB
  const rowSize = 1 + width * 3;
  const raw = Buffer.alloc(height * rowSize);
  for (let y = 0; y < height; y++) {
    raw[y * rowSize] = 0;
    for (let x = 0; x < width; x++) {
      raw[y * rowSize + 1 + x * 3] = r;
      raw[y * rowSize + 1 + x * 3 + 1] = g;
      raw[y * rowSize + 1 + x * 3 + 2] = b;
    }
  }
  const compressed = zlib.deflateSync(raw);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function createMenu(menuDef, color) {
  const [r, g, b] = color;
  // メニュー作成
  const res = await axios.post('https://api.line.me/v2/bot/richmenu', menuDef, { headers });
  const id = res.data.richMenuId;
  console.log(`作成: ${menuDef.name} → ${id}`);

  // 画像アップロード（シンプルな単色PNG）
  const png = makeSimplePng(2500, 843, r, g, b);
  await axios.post(`https://api-data.line.me/v2/bot/richmenu/${id}/content`, png, {
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'image/png' },
    maxBodyLength: Infinity,
  });
  console.log(`画像アップロード完了: ${id}`);
  return id;
}

async function main() {
  console.log('\n=== HOZYO!! リッチメニュー セットアップ ===\n');

  // 既存のAPIメニューを削除
  const existing = await axios.get('https://api.line.me/v2/bot/richmenu/list', { headers });
  for (const m of existing.data.richmenus || []) {
    await axios.delete(`https://api.line.me/v2/bot/richmenu/${m.richMenuId}`, { headers });
    console.log(`既存削除: ${m.name} (${m.richMenuId})`);
  }

  // 新規作成（黄色系）
  const defaultId    = await createMenu(defaultMenu,    [245, 230, 66]);  // 黄色
  const registeredId = await createMenu(registeredMenu, [66, 180, 245]);  // 青

  // デフォルト設定
  await axios.post(`https://api.line.me/v2/bot/user/all/richmenu/${defaultId}`, {}, { headers });
  console.log(`\nデフォルトリッチメニュー設定: ${defaultId}`);

  // 結果出力
  console.log('\n======================================');
  console.log('✅ セットアップ完了！');
  console.log('以下をRenderの環境変数に設定してください:');
  console.log('======================================');
  console.log(`DEFAULT_RICH_MENU_ID     = ${defaultId}`);
  console.log(`REGISTERED_RICH_MENU_ID  = ${registeredId}`);
  console.log('======================================\n');

  // .richmenus.txt に保存
  const out = `DEFAULT_RICH_MENU_ID=${defaultId}\nREGISTERED_RICH_MENU_ID=${registeredId}\n`;
  fs.writeFileSync(path.join(__dirname, '../.richmenus.txt'), out);
  console.log('IDを .richmenus.txt にも保存しました。\n');
}

main().catch(err => {
  console.error('エラー:', err.response?.data || err.message);
  process.exit(1);
});
