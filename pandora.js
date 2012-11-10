// http://pan-do-ra-api.wikia.com/wiki/Json/5
var url = require('url');
var util = require('util');
var crypto = require('crypto');
var request = require('request');
var log4js = require('log4js');
log4js.loadAppender('file');
log4js.addAppender(log4js.appenders.file('logs/pandora.log'), 'Pandora');

var Pandora = function() {
  var self = this;
  self.startTime = new Date().getTime()/1000;
  self.logger = log4js.getLogger('Pandora');
  self.logger.setLevel('DEBUG'); // Or higher to suppress debug
}

Pandora.prototype.encrypt = function(plaintext) {
  var self = this;
  if (typeof plaintext !== 'string') {
    throw 'Invalid plaintext';
  }
  if (plaintext.length <= 0) {
    throw 'No plaintext provided';
  }
  if (!self.partner || !self.partner.encryptPassword) {
    throw 'Partner encrypt password required';
  }
  var cipher = crypto.createCipheriv('BF-ECB', self.partner.encryptPassword, '');
  return cipher.update(plaintext, 'binary', 'hex') + cipher.final('hex');
}

Pandora.prototype.decrypt = function(ciphertext) {
  var self = this;
  if (typeof ciphertext !== 'string') {
    throw 'Invalid ciphertext';
  }
  if (ciphertext.length <= 0) {
    throw 'No ciphertext provided';
  }
  if (!self.partner || !self.partner.decryptPassword) {
    throw 'Partner decrypt password required';
  }
  var decipher = crypto.createDecipheriv('BF-ECB', self.partner.decryptPassword, '');
  return decipher.update(ciphertext, 'hex') + decipher.final('hex');
}

Pandora.prototype.invoke = function(encrypt, tls, method, query, data, callback, debug) {
  var self = this;
  if (typeof encrypt !== 'boolean') {
    throw 'Encrypt flag not specified';
  }
  if (typeof tls !== 'boolean') {
    throw 'TLS flag not specified';
  }
  if (typeof method !== 'string') {
    throw 'Method not specified';
  }
  callback = callback || function() {};
  var options = {
    url: url.format({
      protocol: tls ? 'https' : 'http',
      host: self.partner.host,
      pathname: '/services/json/',
      query: query
    }),
    method: method,
    body: encrypt ? self.encrypt(JSON.stringify(data)) : JSON.stringify(data)
  }
  request(options, function(error, response) {
    var retObj = {
      error: null,
      response: null
    }
    if (error) {
      retObj.error = error;
    } else if (response.statusCode != 200) {
      retObj.error = 'Unexpected status code: ' + response.statusCode;
    } else {
      body = JSON.parse(response.body);
      if (body.stat == 'ok') {
        if (body.result.syncTime) {
          body.result.syncTime = parseInt(self.decrypt(body.result.syncTime).substring(4), 10);
        }
        retObj.response = body.result;
      } else {
        retObj.error = body.message + ' in ' + method + ' ' + self.lookupCode(body.code);
      }
    }
    if (typeof debug === 'boolean' ? debug : true) {
      self.logger.debug('\n' + util.inspect({
        encrypt: encrypt ? data : encrypt,
        tls: tls,
        request: options,
        response: retObj.error || retObj.response
      }, false, null));
    } else {
      self.logger.debug('Log suppressed');
    }
    callback(retObj.error, retObj.response);
  });
};

Pandora.prototype.partnerLogin = function(partner, callback) {
  var self = this;
  self.partner = partner;
  self.invoke(false, true, 'POST', {
    method: 'auth.partnerLogin'
  }, {
    "username": self.partner.username,
    "password": self.partner.password,
    "deviceModel": self.partner.deviceModel,
    "version": '5',
    "includeUrls": true
  }, callback);
}

Pandora.prototype.userLogin = function(user, callback) {
  var self = this;
  self.user = user;
  self.invoke(true, true, 'POST', {
    method: 'auth.userLogin',
    auth_token: self.partnerAuthToken,
    partner_id: self.partnerId
  }, {
    "loginType": "user",
    "username": self.user.username,
    "password": self.user.password,
    "partnerAuthToken": self.partnerAuthToken,
    "includePandoraOneInfo": true,
    "includeSubscriptionExpiration": true,
    "includeAdAttributes": true,
    "returnStationList": true,
    "includeStationArtUrl": true,
    "returnGenreStations": true,
    "includeDemographics": true,
    "returnCapped": true,
    "syncTime": self.syncTime + Math.round(new Date().getTime()/1000 - self.startTime)
  }, callback, false); // If debug is true, password will be exposed in plaintext
}

Pandora.prototype.getStationList = function(callback) {
  var self = this;
  self.invoke(true, false, 'POST', {
    method: 'user.getStationList',
    auth_token: self.userAuthToken,
    partner_id: self.partnerId,
    user_id: self.userId
  }, {
    "userAuthToken": self.userAuthToken,
    "syncTime": self.syncTime + Math.round(new Date().getTime()/1000 - self.startTime)
  }, callback);
}

Pandora.prototype.getPlaylist = function(stationToken, callback) {
  var self = this;
  self.invoke(true, self.partner.securePlaylist ? true : false, 'POST', {
    method: 'station.getPlaylist',
    auth_token: self.userAuthToken,
    partner_id: self.partnerId,
    user_id: self.userId
  }, {
    "userAuthToken": self.userAuthToken,
    "additionalAudioUrl": 'HTTP_40_AAC_MONO,HTTP_64_AAC,HTTP_32_AACPLUS,HTTP_64_AACPLUS,HTTP_24_AACPLUS_ADTS,HTTP_32_AACPLUS_ADTS,HTTP_64_AACPLUS_ADTS,HTTP_128_MP3,HTTP_32_WMA',
    "syncTime": self.syncTime + Math.round(new Date().getTime()/1000 - self.startTime),
    "stationToken": stationToken
  }, callback);
}

Pandora.prototype.partners = {
  android: { // Android
    host: 'tuner.pandora.com',
    username: 'android',
    password: 'AC7IBG09A3DTSYM4R41UJWL07VLN8JI7',
    deviceModel: 'android-generic',
    decryptPassword: 'R=U!LH$O2B#',
    encryptPassword: '6#26FRL$ZWD'
  },
  iphone: { // iOS
    host: 'tuner.pandora.com',
    username: 'iphone',
    password: 'P2E4FC0EAD3*878N92B2CDp34I0B1@388137C',
    deviceModel: 'IP01',
    decryptPassword: '20zE1E47BE57$51',
    encryptPassword: '721^26xE22776'
  },
  palm: { // Palm
    host: 'tuner.pandora.com',
    username: 'palm',
    password: 'IUC7IBG09A3JTSYM4N11UJWL07VLH8JP0',
    deviceModel: 'pre',
    decryptPassword: 'E#U$MY$O2B=',
    encryptPassword: '%526CBL$ZU3'
  },
  winmo: { // Windows Mobile
    host: 'tuner.pandora.com',
    username: 'winmo',
    password: 'ED227E10a628EB0E8Pm825Dw7114AC39',
    deviceModel: 'VERIZON_MOTOQ9C',
    decryptPassword: '7D671jt0C5E5d251',
    encryptPassword: 'v93C8C2s12E0EBD'
  },
  one: { // Desktop (AIR) Client
           // NOTE: Requires a Pandora One account. Fails at station.getPlaylist without one.
    host: 'internal-tuner.pandora.com',
    username: 'pandora one',
    password: 'TVCKIBGS9AO9TSYLNNFUML0743LH82D',
    deviceModel: 'D01',
    decryptPassword: 'U#IO$RZPAB%VX2',
    encryptPassword: '2%3WCL*JU$MP]4',
    securePlaylist: true
  },
  vista: { // Vista Widget
    host: 'internal-tuner.pandora.com',
    username: 'windowsgadget',
    password: 'EVCCIBGS9AOJTSYMNNFUML07VLH8JYP0',
    deviceModel: 'WG01',
    decryptPassword: 'E#IO$MYZOAB%FVR2',
    encryptPassword: '%22CML*ZU$8YXP[1'
  }
}

Pandora.prototype.lookupCode = function(code) {
  var str = '(' + code + ') ';
  switch(code) {
  case 0:
    str += 'INTERNAL';
    break;
  case 1:
    str += 'MAINTENANCE_MODE';
    break;
  case 2:
    str += 'URL_PARAM_MISSING_METHOD';
    break;
  case 3:
    str += 'URL_PARAM_MISSING_AUTH_TOKEN';
    break;
  case 4:
    str += 'URL_PARAM_MISSING_PARTNER_ID';
    break;
  case 5:
    str += 'URL_PARAM_MISSING_USER_ID';
    break;
  case 6:
    str += 'SECURE_PROTOCOL_REQUIRED';
    break;
  case 7:
    str += 'CERTIFICATE_REQUIRED';
    break;
  case 8:
    str += 'PARAMETER_TYPE_MISMATCH';
    break;
  case 9:
    str += 'PARAMETER_MISSING';
    break;
  case 10:
    str += 'PARAMETER_VALUE_INVALID';
    break;
  case 11:
    str += 'API_VERSION_NOT_SUPPORTED';
    break;
  case 12:
    str += 'LICENSING_RESTRICTIONS, Pandora not available in this country';
    break;
  case 13:
    str += 'INSUFFICIENT_CONNECTIVITY, Bad sync time?';
    break;
  case 14:
    str += 'UNKNOWN';
    break;
  case 15:
    str += 'Wrong protocol (http/https)?';
    break;
  case 1000:
    str += 'READ_ONLY_MODE';
    break;
  case 1001:
    str += 'INVALID_AUTH_TOKEN, Occurs once a user auth token expires';
    break;
  case 1002:
    str += 'INVALID_LOGIN, Wrong credentials';
    break;
  default:
    str += 'UNKNOWN';
  }
  return str;
}

var pandora = new Pandora();
module.exports = pandora;