// =====================================================
// SheetAPI.gs
// Googleスプレッドシートの「スクリプトエディタ」に貼り付けて
// Webアプリとしてデプロイしてください。
// =====================================================

// ★ここを変更：自分で決めた秘密キー（英数字20文字程度）
var SECRET_KEY = 'change_this_secret_key_12345';

var SHEET = {
  USERS:         '登録者',
  SESSIONS:      'セッション',
  CLUB_USERS:    'クラブ登録者',
  CLUB_SESSIONS: 'クラブセッション',
  REQUESTS:      '要請',
};

// ── メインエントリー ──

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET_KEY) return res({ error: 'Unauthorized' });

    switch (body.op) {
      // コーチ側
      case 'setup':         return res(setup());
      case 'getSession':    return res(getSession(body.userId));
      case 'saveSession':   saveSession(body.userId, body.state, body.tempData); return res({ ok: true });
      case 'deleteSession': deleteSession(body.userId); return res({ ok: true });
      case 'saveUser':      return res({ regNo: saveUser(body.userId, body.data) });
      case 'getUser':       return res(getUser(body.userId));
      case 'updateStatus':  updateStatus(body.userId, body.status, body.approvedAt); return res({ ok: true });
      // クラブ側
      case 'getClubSession':    return res(getClubSession(body.userId));
      case 'saveClubSession':   saveClubSession(body.userId, body.state, body.tempData); return res({ ok: true });
      case 'deleteClubSession': deleteClubSession(body.userId); return res({ ok: true });
      case 'saveClub':          return res({ regNo: saveClub(body.userId, body.data) });
      case 'getClub':           return res(getClub(body.userId));
      case 'saveRequest':       return res({ requestId: saveRequest(body.userId, body.data) });
      case 'getRequest':        return res(getRequest(body.requestId));
      case 'updateRequest':     updateRequest(body.requestId, body.status, body.coachUserId); return res({ ok: true });
      case 'getCoachesBySport': return res(getCoachesBySport(body.sport));
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

// ── セットアップ ──

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

  var clubUsers = ss.getSheetByName(SHEET.CLUB_USERS) || ss.insertSheet(SHEET.CLUB_USERS);
  if (clubUsers.getLastRow() === 0) {
    clubUsers.appendRow(['LINE UserID','部活名','スポーツ','練習場所','指導対象年齢','登録日時','登録番号']);
    clubUsers.getRange(1,1,1,7).setFontWeight('bold').setBackground('#6aa84f').setFontColor('#ffffff');
  }

  var clubSess = ss.getSheetByName(SHEET.CLUB_SESSIONS) || ss.insertSheet(SHEET.CLUB_SESSIONS);
  if (clubSess.getLastRow() === 0) {
    clubSess.appendRow(['LINE UserID','状態','一時データJSON','更新日時']);
    clubSess.getRange(1,1,1,4).setFontWeight('bold').setBackground('#93c47d').setFontColor('#ffffff');
  }

  var requests = ss.getSheetByName(SHEET.REQUESTS) || ss.insertSheet(SHEET.REQUESTS);
  if (requests.getLastRow() === 0) {
    requests.appendRow(['要請ID','クラブUserID','スポーツ','部活名','曜日','開始時間','終了時間','練習場所','ステータス','マッチコーチUserID','作成日時']);
    requests.getRange(1,1,1,11).setFontWeight('bold').setBackground('#f6b26b').setFontColor('#ffffff');
  }

  return { ok: true };
}

// ── コーチセッション ──

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

// ── コーチ登録者 ──

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

// ── クラブセッション ──

function getClubSession(userId) {
  var rows = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET.CLUB_SESSIONS).getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === userId) {
      return { state: rows[i][1], tempData: rows[i][2] ? JSON.parse(rows[i][2]) : {} };
    }
  }
  return null;
}

function saveClubSession(userId, state, tempData) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.CLUB_SESSIONS);
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

function deleteClubSession(userId) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.CLUB_SESSIONS);
  var rows  = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === userId) { sheet.deleteRow(i+1); return; }
  }
}

// ── クラブ登録者 ──

function nextClubRegNo() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.CLUB_USERS);
  var n     = Math.max(sheet.getLastRow() - 1, 0);
  return 'CLUB-' + new Date().getFullYear() + '-' + String(n+1).padStart(4,'0');
}

function saveClub(userId, data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.CLUB_USERS);
  var regNo = nextClubRegNo();
  sheet.appendRow([userId, data.name, data.sport, data.location, data.age, new Date().toISOString(), regNo]);
  return regNo;
}

function getClub(userId) {
  var rows = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET.CLUB_USERS).getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === userId) {
      return { userId: rows[i][0], name: rows[i][1], sport: rows[i][2], location: rows[i][3], age: rows[i][4], regNo: rows[i][6] };
    }
  }
  return null;
}

// ── 要請 ──

function nextRequestId() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.REQUESTS);
  var n     = Math.max(sheet.getLastRow() - 1, 0);
  return 'REQ-' + new Date().getFullYear() + '-' + String(n+1).padStart(4,'0');
}

function saveRequest(clubUserId, data) {
  var sheet     = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.REQUESTS);
  var requestId = nextRequestId();
  sheet.appendRow([requestId, clubUserId, data.sport, data.clubName, data.days, data.startTime, data.endTime, data.reqLocation, 'PENDING', '', new Date().toISOString()]);
  return requestId;
}

function getRequest(requestId) {
  var rows = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET.REQUESTS).getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === requestId) {
      return { requestId: rows[i][0], clubUserId: rows[i][1], sport: rows[i][2], clubName: rows[i][3], days: rows[i][4], startTime: rows[i][5], endTime: rows[i][6], reqLocation: rows[i][7], status: rows[i][8], coachUserId: rows[i][9] };
    }
  }
  return null;
}

function updateRequest(requestId, status, coachUserId) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.REQUESTS);
  var rows  = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === requestId) {
      sheet.getRange(i+1,9).setValue(status);
      if (coachUserId) sheet.getRange(i+1,10).setValue(coachUserId);
      return;
    }
  }
}

// ── スポーツ別コーチ一覧（APPROVED のみ） ──

function getCoachesBySport(sport) {
  var rows = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET.USERS).getDataRange().getValues();
  var result = [];
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][3] === sport && rows[i][8] === 'APPROVED') {
      result.push({ userId: rows[i][0], name: rows[i][1], sport: rows[i][3], regNo: rows[i][10] });
    }
  }
  return result;
}
