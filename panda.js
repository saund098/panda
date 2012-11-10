// Obtain ID3 tags through http://musicbrainz.org/doc/MusicBrainz_Picard
var fs = require('fs');
var url = require('url');
var async = require('async');
var request = require('request');
var command = require('commander');
var pandora = require('./pandora.js');
var fileUtils = require ("file-utils");

var merge = function(a,b) {
  for(var i in b) {
    a[i] = b[i];
  }
  return a;
}

var saveSong = function(song, callback) {
  var start = new Date().getTime();
  pandora.debug = true;
  var songParams;
  if (song.audioUrlMap.highQuality) {
    songParams = song.audioUrlMap.highQuality;
  } else if (song.audioUrlMap.mediumQuality) {
    songParams = song.audioUrlMap.mediumQuality;
  } else {
    songParams = song.audioUrlMap.lowQuality;
  }
  var songUrl = url.parse(songParams.audioUrl);
  var filename = './Music/' + songUrl.hostname + '/' + songUrl.pathname.replace(/[\\]/g, '/');
  var songFile = new fileUtils.File(filename);
  var songFolder = new fileUtils.File(songFile.getParent());
  songFolder.createDirectory(function(error, created) {
    var r = request(songParams.audioUrl).pipe(fs.createWriteStream(songFile.getAbsolutePath()));
    var pauseBeforeNextSong = function() {
      var duration = 15*1000 - (new Date().getTime() - start);
      setTimeout(function() {
        callback();
      }, duration);
      console.log('Waiting ' + Math.round(duration/1000) + ' seconds before downloading the next song');
    };
    r.on('error', function() {
      console.log('Failed to save ' + songFile.getAbsolutePath());
      pauseBeforeNextSong();
    });
    r.on('close', function() {
      console.log('Saved to ' + songFile.getAbsolutePath());
      pauseBeforeNextSong();
    });
  });
}

async.waterfall([
  function(callback) { // perform partner login
    pandora.partnerLogin(pandora.partners.one, callback);
  }, function(response, callback) { // prompt for user credentials and perform user login
    merge(pandora, response);
    command.prompt('username: ', function(username) {
      command.password('password: ', function(password) {
        pandora.userLogin({
          username: username,
          password: password
        }, callback);
      });
    });
  }, function(response, callback) { // get station list
    merge(pandora, response);
    pandora.getStationList(callback);
  }, function(response, callback) { // prompt for station selection
    merge(pandora, response);
    /*
    var stationNames = []
    pandora.stations.forEach(function(station) {
      stationNames.push(station.stationName);
    });
    command.choose(stationNames, function(i) {
      pandora.station = pandora.stations[i];
      callback(null, 'done');
    });
    */
    pandora.station = pandora.stations[0]; // select quick mix
    callback(null, 'done');
  }
], function(error, success) { // log error, otherwise download songs
  if (error) {
    console.log(error);
  } else {
    async.whilst(function() { return true; }, function(callback) {
      pandora.getPlaylist(pandora.station.stationToken, function(error, response) {
        if (error) {
          callback(error);
        } else {
          async.forEachSeries(response.items, saveSong, function(error) {
            callback(error);
          });
        }
      });
    }, function(error) {
      console.log(error);
    });
  }
});
