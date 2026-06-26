require('dotenv').config();

const STATE = {
  NONE: 'NONE', NAME: 'NAME', AGE: 'AGE', SPORT: 'SPORT',
  STUDENT_ID: 'STUDENT_ID', TOURNAMENT_NAME: 'TOURNAMENT_NAME',
  TOURNAMENT_PROOF: 'TOURNAMENT_PROOF', CONFIRM: 'CONFIRM',
  PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED',
};

const SPORTS = ['バスケットボール', 'サッカー', '野球'];

module.exports = {
  line: {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret:      process.env.LINE_CHANNEL_SECRET,
  },
  adminUserId:       process.env.ADMIN_LINE_USER_ID,
  gasWebAppUrl:      process.env.GAS_WEB_APP_URL,
  gasSecret:         process.env.GAS_SECRET,
  adminImageSecret:  process.env.ADMIN_IMAGE_SECRET,
  renderUrl:         process.env.RENDER_URL,
  STATE,
  SPORTS,
};
