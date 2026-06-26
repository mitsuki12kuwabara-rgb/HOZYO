// =====================================================
// SheetAPI.gs
// Googleスプレッドシートの「スクリプトエディタ」に貼り付けて
// Webアプリとしてデプロイしてください。
// =====================================================

// ★ここを変更：自分で決めた秘密キー（英数字20文字程度）
var SECRET_KEY = 'change_this_secret_key_12345';

var SHEET = { USERS: '登録者', SESSIONS: 'セッション' };

// ── メインエントリー ──

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET_KEY) return res({ error: 'Unauthorized' });

    switch (body.op) {
      case 'setup':         return res(setup());
      case 'getSession':    return res(getSession(body.userId));
      case 'saveSession':   saveSession(body.userId, body.state, body.tempData); return res({ ok: true });
      case 'deleteSession': deleteSession(body.userId); return res({ ok: true });
      case 'saveUser':      return res({ regNo: saveUser(body.userId, body.data) });
      case 'getUser':       return res(getUser(body.userId));
      case 'updateStatus':  updateStatus(body.userId, body.status, body.approvedAt); return res({ ok: true });
      default:              return res({ error: 'unknown op' });
    }
  } catch(err) {
    return res({ error: err.toString() });
  }
}

function res(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── セットアップ（初回のみ） ──

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var users = ss.getSheetByName(SHEET.USERS) || ss.insertSheet(SHEET.USERS);
  if (users.getLastRow() === 0) {
    users.appendRow(['LINE UserID','名前','年齢','スポーツ','学生証MsgID','大会名','証明MsgID','登録日時','ステータス','承認日時','登録番号']);
    users.getRange(1,1,1,11).setFontWeight('bold').setBackground('#4a86e8').setFontColor('#ffffff');
  }

  var sess = ss.getSheetByName(SHEET.SESSIONS) || ss.insertSheet(SHEET.SESSIONS);
  if (sess.getLastRow() === 0) {
    sess.appendRow(['LINE UserID','状態','一時データJSON','更新日時']);
    sess.getRange(1,1,1,4).setFontWeight('bold').setBackground('#e06666').setFontColor('#ffffff');
  }

  return { ok: true };
}

// ── セッション ──

function getSession(userId) {
  var rows = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET.SESSIONS).getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === userId) {
      return { state: rows[i][1], tempData: rows[i][2] ? JSON.parse(rows[i][2]) : {} };
    }
  }
  return null;
}

function saveSession(userId, state, tempData) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.SESSIONS);
  var rows  = sheet.getDataRange().getValues();
  var now   = new Date().toISOString();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === userId) {
      sheet.getRange(i+1,1,1,4).setValues([[userId, state, JSON.stringify(tempData||{}), now]]);
      return;
    }
  }
  sheet.appendRow([userId, state, JSON.stringify(tempData||{}), now]);
}

function deleteSession(userId) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.SESSIONS);
  var rows  = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === userId) { sheet.deleteRow(i+1); return; }
  }
}

// ── 登録者 ──

function nextRegNo() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.USERS);
  var n     = Math.max(sheet.getLastRow() - 1, 0);
  return 'COACH-' + new Date().getFullYear() + '-' + String(n+1).padStart(4,'0');
}

function saveUser(userId, data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.USERS);
  var regNo = nextRegNo();
  sheet.appendRow([
    userId, data.name, data.age, data.sport,
    data.studentIdMsgId || '', data.tournamentName, data.proofMsgId || '',
    new Date().toISOString(), 'PENDING', '', regNo,
  ]);
  return regNo;
}

function getUser(userId) {
  var rows = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET.USERS).getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === userId) {
      return {
        userId: rows[i][0], name: rows[i][1], age: rows[i][2], sport: rows[i][3],
        studentIdMsgId: rows[i][4], tournamentName: rows[i][5], proofMsgId: rows[i][6],
        registeredAt: rows[i][7], status: rows[i][8], approvedAt: rows[i][9], regNo: rows[i][10],
      };
    }
  }
  return null;
}

function updateStatus(userId, status, approvedAt) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.USERS);
  var rows  = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === userId) {
      sheet.getRange(i+1,9).setValue(status);
      if (approvedAt) sheet.getRange(i+1,10).setValue(approvedAt);
      return;
    }
  }
}
