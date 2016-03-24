const PERSISTENCE_INTERVAL = 5000; // milliseconds
const INSERTED_RECORDS_FORMAT = '***** INSERTED (%s:%d, %s:%d, %s:%d) records in %dms';
const ERROR_MISSING_CONFIG = 'The configuration value %s is missing; it\'s required to %s.';

var sprintf = require("sprintf-js").sprintf,
    MongoClient = require('mongodb').MongoClient
    async = require('async');

var conString;

var queues = {
  errorlog: [],
  socketdata: [],
  wikiedits: []
};
Object.freeze(queues);

function withMongoConnection(callback) {
  if(conString) {
    MongoClient.connect(conString, function(err, db) {
      if (err) console.error('error fetching client from pool', err);
      callback(err, db);
    });
  } else {
      var errorMessage = sprintf(ERROR_MISSING_CONFIG, 'conString', 'connect to the database');
      console.log(errorMessage);

      var error = new Error(errorMessage);
      callback(error, {});
  }
}

function insertData(collection, records, callback) {
  if(records.length < 1) {
    callback();
    return;
  }
  withMongoConnection(function(err, db) {
    if (err) {
      callback(err);
      return;
    }
    db.collection(collection).insert(
      records,
      function(err, result){
        db.close();
        callback(err, result);
      }
    );
  });
}

function persistChanges(){
  var iBeforeQuery = (new Date()).getTime();
  var errorRecords = queues.errorlog.slice();
  var socketRecords = queues.socketdata.slice();
  var wikieditRecords = queues.wikiedits.slice();

  var dbChanges = [
    function(callback) {
      insertData(
          'socketdata_dashboard',
          socketRecords,
          function(err, result){
            if (err) console.error('error inserting a socket data record into the socketdata_dashboard collection', err);
            callback(err, { result: result });
          }
      );
    },
    function(callback) {
      insertData(
          'wikiedits_dashboard',
          wikieditRecords,
          function(err, result){
            if (err) console.error('error inserting an edit into the wikiedits_dashboard collection', err);
            callback(err, { result: result });
          }
      );
    },
    function(callback) {
      insertData(
          'errorlog_dashboard',
          errorRecords,
          function(err, result){
            if (err) return console.error('error inserting an error into the errorlog_dashboard collection', err);
            callback(err, { result: result });
          }
      );
    },
    function(callback) {
      insertData(
          'socketdata',
          socketRecords,
          function(err, result){
            if (err) console.error('error inserting a socket data record into the socketdata collection', err);
            else queues.socketdata.splice(0, socketRecords.length);
            callback(err, { result: result });
          }
      );
    },
    function(callback) {
      insertData(
          'wikiedits',
          wikieditRecords,
          function(err, result){
            if (err) console.error('error inserting an edit into the wikiedits collection', err);
            else queues.wikiedits.splice(0, wikieditRecords.length);
            callback(err, { result: result });
          }
      );
    },
    function(callback) {
      insertData(
          'errorlog',
          errorRecords,
          function(err, result){
            if (err) return console.error('error inserting an error into the errorlog collection', err);
            else queues.errorlog.splice(0, errorRecords.length);
            callback(err, { result: result });
          }
      );
    }
  ];

  async.parallel(dbChanges, function(err, resultList) {
    var iAfterQuery = (new Date()).getTime();
    var iMs = iAfterQuery - iBeforeQuery;

    if(err) {
      console.error('There was an error persisting data.', err);
    } else {
      console.log(sprintf(
          INSERTED_RECORDS_FORMAT, 
          'wikiedits', wikieditRecords.length,
          'socketdata', socketRecords.length,
          'errorlog', errorRecords.length,
          iMs
        ));
    }
    setTimeout(persistChanges, PERSISTENCE_INTERVAL);
  });

}

module.exports = {
  queues: queues,
  startMonitoring: function(config){
    conString = config.conString;
    setTimeout(persistChanges, PERSISTENCE_INTERVAL);
  }
};

