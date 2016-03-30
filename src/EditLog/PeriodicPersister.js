"use strict";

const PERSISTENCE_INTERVAL = 5000; // milliseconds
const INSERTED_RECORDS_FORMAT = '***** INSERTED (%s) records in %dms';
const ERROR_MISSING_CONFIG = 'The configuration value %s is missing; it\'s required to %s.';

var sprintf = require("sprintf-js").sprintf,
    MongoClient = require('mongodb').MongoClient,
    async = require('async'),
    EVENTS = require('./EventDefinitions.js');

function withMongoConnection(conString, callback) {
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

function insertData(conString, collection, records, callback) {
  if(records.length < 1) {
    callback();
    return;
  }
  withMongoConnection(conString, function(err, db) {
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

function persistChanges(persisterData){
  var iBeforeQuery = (new Date()).getTime();

  var tmpQueues = {};
  var dbChanges = [];
  Object.keys(persisterData.queues).forEach(function(q){
    tmpQueues[q] = persisterData.queues[q].slice();
    dbChanges.push(function(callback){
      insertData(
          persisterData.conString,
          q,
          tmpQueues[q],
          function(err, result){
            if (err) {
              console.error('error inserting data into the ' + q + ' collection', err);
            }
            else persisterData.queues[q].splice(0, tmpQueues[q].length);
            callback(err, { result: result });
          }
      );
    });
  });

  async.parallel(dbChanges, function(err, resultList) {
    var iAfterQuery = (new Date()).getTime();
    var iMs = iAfterQuery - iBeforeQuery;

    if(err) {
      console.error('There was an error persisting data.', err);
    } else {
      var qShow = [];
      for(var q of Object.keys(tmpQueues)) {
        qShow.push(q + ':' + tmpQueues[q].length);
      }

      console.log(sprintf(
          INSERTED_RECORDS_FORMAT, 
          qShow.join(','),
          iMs
        ));
    }
    persisterData.timeout = setTimeout(function(){
      persistChanges(persisterData);
    }, PERSISTENCE_INTERVAL);
  });

}

var persisters = new WeakMap();
class PeriodicPersister {
  constructor(options) {

    persisters.set(this, {
      conString: options.conString,
      emitter: options.emitter,
      queues: {
        socketdata: [],
        wikiedits: [],
        errorlog: [],
      },
      monitoring: false,
      timeout: null
    });
  }
  startMonitoring() {
    var opts = persisters.get(this),
        emitter = opts.emitter,
        queues = opts.queues;

    if(opts.monitoring) {
      throw Error('Cannot start monitoring more than once.');
    }

    var saveSocketMessage;
    emitter.on(EVENTS.socketdata, saveSocketMessage = function (message){
      queues.socketdata.push({ message: message });
    });

    var saveWikiEdits;
    emitter.on(EVENTS.wikiedits, saveWikiEdits = function (message){
      if(message.edits.length) {
        queues.wikiedits.push.apply(queues.wikiedits, message.edits);
      }
    });

    var saveErrorMessage;
    emitter.on(EVENTS.logged_error, saveErrorMessage = function (message){
      message.revnew = parseInt(message.revnew);
      queues.errorlog.push(message);
    });

    opts.timeout = setTimeout(function(){
      persistChanges(opts);
    }, PERSISTENCE_INTERVAL);

    opts.monitoring = true;
    opts.listeners = {
      socketdata: saveSocketMessage,
      wikiedits: saveWikiEdits,
      logged_error: saveErrorMessage
    };
  }
  stopMonitoring() {
    var opts = persisters.get(this),
        emitter = opts.emitter,
        listeners = opts.listeners;

    if(opts.monitoring) {
      throw Error('Cannot stop monitoring when you\'re not monitoring.');
    }

    clearTimeout(opts.timeout);
    opts.timeout = null;

    emitter.removeListener(EVENTS.socketdata, listeners.socketdata);
    emitter.removeListener(EVENTS.wikiedits, listeners.wikiedits);
    emitter.removeListener(EVENTS.logged_error, listeners.logged_error);

    opts.monitoring = false;
    delete opts.listeners;
  }
}

module.exports = PeriodicPersister;

