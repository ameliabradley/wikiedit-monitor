var assert = require('assert'),
    vows = require('vows'),
    express = require('express'),
    loader = require('auto-loader'),
    fs = require('fs'),
    path = require('path');
    //MongoClient = require('mongodb').MongoClient;

var modules = loader.load(__dirname + '/../src');

// Get the configuration
var configPath = path.join(__dirname, "../config.json");
var config = JSON.parse(fs.readFileSync(configPath));
var conString = config.testConString;

var oDummyConfig = {
  "//": "Limit data size w/ collections that rotate out old data",
  "//": "See: https://docs.mongodb.org/manual/core/capped-collections/",
  "cap_collections": false,

  "//": "Max summed size of all capped collections in bytes - Default: 3GB",
  "//": "Minimum allowed size: 4096 bytes per collection",
  "cap_total_size": 3000000000,

  // TEST DATABASE, WHICH IS DROPPED AND RECREATED
  "conString": config.testConString,
  "max_reconnection_attempts": 0,
  host: "localhost",
  port: 3000
};

// Uncomment for tracking down strange errors
process.on('uncaughtException', function(err) {
  console.log('Caught exception: ' + err.stack);
});

var editLog;

vows.describe('socket-data-example').addBatch({
  'When running database init script': {
    topic: function () {
      var initDb = new modules.EditLog.InitDb(config);
      var self = this;
      initDb.initialize(function () {
        self.callback("succeeded");
      }, function () {
        self.callback("failed");
      });
    },
    'nothing crazy should happen': function (result, provs, bounds) {
      assert.equal(result, "succeeded");
    }
  },
  'When WikiApi queries for some sample data': {
    topic: function () {
      var self = this;

      var app = express.createServer();
      var server = app.listen(3000);

      app.get('/w/api.php', function (req, res) {
        // Source: https://en.wikipedia.org/w/api.php?action=query&prop=revisions&format=json&rvdiffto=prev&revids=708853577|708853655|708970243|708319994|708163001
        fs.readFile(__dirname + '/data/revdeletes.json', function (err,data) {
          if (err) {
            res.writeHead(404);
            res.end(JSON.stringify(err));
            return;
          }
          res.writeHead(200);
          res.end(data);
        });
      });

      var wikiApi = new modules.EditLog.WikiApi(oDummyConfig);
      wikiApi.getRevisions([
        708853577,
        708853655,
        708970243,
        708319994,
        708163001
      ], function () {
        self.callback({ done: true });
        server.close();
      }, function () {
        self.callback({ done: false });
        server.close();
      });
    },
    'query should parse and return without error': function (err, provs, bounds) {
      // TODO: Verify that data was parsed *correctly*
      assert.ok(err.done);
    }
  }

  // TODO: Fake socket connection with sample data
  // TODO: Attempt to connect to a mongodb, insert data, make sure data is valid, etc

  /*
  'When running for a bit': {
    topic: function () {
      var self = this;

      var app = express.createServer();
      app.listen(3000);

      app.get('/w/api.php', function (req, res) {
          res.send('Hello World!');
          self.callback({ done: true });
      });

      MongoClient.connect(conString, function(err, db) {
        db.dropDatabase();

        m_editLog = new modules.EditLog.EditLog(oDummyConfig);
        m_editLog.start();
      });

      setTimeout(function () {
        self.callback({ done: "timeout" });
      }, 5000);

      return;
    },
    'database should be populated correctly': function (err, provs, bounds) {
      //assert.isNumber(result);
      //assert.equal(true, true);
      console.log("xxxxx BACK!!!!!!!!!!");
      console.log(err, provs, bounds);
      assert.ok(err.done);
      m_editLog.stop();
    }
  },
  */
}).export(module);
