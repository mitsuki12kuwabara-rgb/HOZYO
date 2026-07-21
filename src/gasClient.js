// GoogleスプレッドシートのGAS WebアプリをAPIとして呼び出す
const axios  = require('axios');
const config = require('./config');

async function call(op, data) {
  const res = await axios.post(config.gasWebAppUrl, {
    secret: config.gasSecret,
    op,
    ...data,
  }, { timeout: 15000 });
  return res.data;
}

module.exports = {
  // コーチ側
  setup:         ()                           => call('setup'),
  getSession:    (userId)                     => call('getSession',    { userId }),
  saveSession:   (userId, state, tempData)    => call('saveSession',   { userId, state, tempData }),
  deleteSession: (userId)                     => call('deleteSession', { userId }),
  saveUser:           (userId, data)               => call('saveUser',           { userId, data }),
  getUser:            (userId)                     => call('getUser',            { userId }),
  updateStatus:       (userId, status, approvedAt) => call('updateStatus',       { userId, status, approvedAt }),
  saveShifts:         (userId, shifts)             => call('saveShifts',         { userId, shifts }),
  getRequestsByCoach: (coachUserId)                => call('getRequestsByCoach', { coachUserId }),
  saveAbsenceReport:  (userId, data)               => call('saveAbsenceReport',  { userId, data }),
  saveFeedback:       (userId, data)               => call('saveFeedback',       { userId, data }),
  // クラブ側フィードバック
  getRequestsByClub:  (clubUserId)                 => call('getRequestsByClub',  { clubUserId }),
  saveClubFeedback:   (userId, data)               => call('saveClubFeedback',   { userId, data }),
  // クラブ側
  getClubSession:    (userId)                  => call('getClubSession',    { userId }),
  saveClubSession:   (userId, state, tempData) => call('saveClubSession',   { userId, state, tempData }),
  deleteClubSession: (userId)                  => call('deleteClubSession', { userId }),
  saveClub:          (userId, data)            => call('saveClub',          { userId, data }),
  getClub:           (userId)                  => call('getClub',           { userId }),
  saveRequest:       (userId, data)            => call('saveRequest',       { userId, data }),
  getRequest:        (requestId)               => call('getRequest',        { requestId }),
  updateRequest:     (requestId, status, coachUserId) => call('updateRequest', { requestId, status, coachUserId }),
  endMatch:          (requestId)               => call('endMatch',          { requestId }),
  getCoachesBySport: (sport)                   => call('getCoachesBySport', { sport }),
};
