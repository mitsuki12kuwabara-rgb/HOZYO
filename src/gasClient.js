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
  setup:         ()                          => call('setup'),
  getSession:    (userId)                    => call('getSession',    { userId }),
  saveSession:   (userId, state, tempData)   => call('saveSession',   { userId, state, tempData }),
  deleteSession: (userId)                    => call('deleteSession', { userId }),
  saveUser:      (userId, data)              => call('saveUser',      { userId, data }),
  getUser:       (userId)                    => call('getUser',       { userId }),
  updateStatus:  (userId, status, approvedAt)=> call('updateStatus',  { userId, status, approvedAt }),
};
