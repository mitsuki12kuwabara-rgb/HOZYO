require('dotenv').config();

const STATE = {
  NONE: 'NONE', NAME: 'NAME', AGE: 'AGE', SPORT: 'SPORT',
  HEIGHT_WEIGHT: 'HEIGHT_WEIGHT', PLAYING: 'PLAYING', CAREER: 'CAREER',
  STUDENT_ID: 'STUDENT_ID',
  QUAL_TYPE: 'QUAL_TYPE', TOURNAMENT_NAME: 'TOURNAMENT_NAME',
  TOURNAMENT_PROOF: 'TOURNAMENT_PROOF', CONFIRM: 'CONFIRM',
  SHIFT_DAYS: 'SHIFT_DAYS', SHIFT_SLOT: 'SHIFT_SLOT', SHIFT_CONFIRM: 'SHIFT_CONFIRM',
  PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED',
  REPORT_SESSION: 'REPORT_SESSION', REPORT_DATE: 'REPORT_DATE',
  REPORT_REASON: 'REPORT_REASON', REPORT_CONFIRM: 'REPORT_CONFIRM',
  FB_SESSION: 'FB_SESSION', FB_RATING: 'FB_RATING', FB_COMMENT: 'FB_COMMENT',
};

const SPORTS = ['バスケットボール', 'サッカー', '野球'];

module.exports = {
  line: {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret:      process.env.LINE_CHANNEL_SECRET,
  },
  club: {
    channelAccessToken: process.env.CLUB_LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret:      process.env.CLUB_LINE_CHANNEL_SECRET,
  },
  adminUserId:       process.env.ADMIN_LINE_USER_ID,
  clubAdminUserId:   process.env.CLUB_ADMIN_LINE_USER_ID,
  gasWebAppUrl:      process.env.GAS_WEB_APP_URL,
  gasSecret:         process.env.GAS_SECRET,
  adminImageSecret:  process.env.ADMIN_IMAGE_SECRET,
  renderUrl:         process.env.RENDER_URL,
  STATE,
  SPORTS,
};
