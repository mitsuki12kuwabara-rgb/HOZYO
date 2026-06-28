const line   = require('@line/bot-sdk');
const config = require('./config');

const clubLineConfig = {
  channelAccessToken: config.club.channelAccessToken,
  channelSecret:      config.club.channelSecret,
};

const clubClient     = new line.Client(clubLineConfig);
const clubMiddleware = line.middleware(clubLineConfig);

module.exports = { clubClient, clubMiddleware };
