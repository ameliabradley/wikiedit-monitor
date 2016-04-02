"use strict";

const PERSISTENCE_INTERVAL = 5000; // milliseconds
const INSERTED_RECORDS_FORMAT = '***** INSERTED (%s) records in %dms';
const ERROR_MISSING_CONFIG = 'The configuration value %s is missing; it\'s required to %s.';

var sprintf = require("sprintf-js").sprintf,
    MongoClient = require('mongodb').MongoClient,
    async = require('async'),
    EVENTS = require('./EventDefinitions.js');

function persistChanges(persisterData){
  var connector = persisterData.connector;
  var iBeforeQuery = (new Date()).getTime();

  var tmpQueues = {};
  var dbChanges = [];
  Object.keys(persisterData.queues).forEach(function(q){
    tmpQueues[q] = persisterData.queues[q].slice();
    dbChanges.push(function(callback){
      connector.insertData(
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
  constructor(emitter, connector) {

    persisters.set(this, {
      emitter: emitter,
      connector: connector,
      queues: {},
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

    var saveData;
    emitter.on(EVENTS.persist_data, saveData = function (message){
        if( ! ( message.collection in queues)) {
            queues[message.collection] = [];
        }
        queues[message.collection].push.apply(queues[message.collection], message.records);
    });

    opts.timeout = setTimeout(function(){
      persistChanges(opts);
    }, PERSISTENCE_INTERVAL);

    opts.monitoring = true;
    opts.listeners = {
      persist_data: saveData,
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

    emitter.removeListener(EVENTS.persist_data, listeners.persist_data);

    opts.monitoring = false;
    delete opts.listeners;
  }
}

module.exports = PeriodicPersister;

