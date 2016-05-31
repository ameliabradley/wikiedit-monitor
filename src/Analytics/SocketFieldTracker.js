"use strict";

const EVENTS = require('../EditLog/EventDefinitions.js'),
  PERSISTENCE_EVENTS = require('../Persistence/EventDefinitions.js');

function getObjectProps(obj, prefix) {
  prefix = (prefix ? (prefix + '.') : '');
  var keyList = Object.keys(obj).map((s) => prefix + s);
  for(var n of Object.keys(obj)) {
    if(obj[n] && obj[n].toString && obj[n].toString() === '[object Object]') {
      delete keyList[keyList.indexOf(n)];
      Array.prototype.push.apply(keyList, getObjectProps(obj[n], prefix + n));
    }
  }
  return keyList;
}

var trackers = new WeakMap();
class SocketFieldTracker {
  constructor(emitter, connector) {
    trackers.set(this, {
      emitter: emitter,
      connector: connector,
      propsSent: [],
      monitoring: false
    });
  }
  startMonitoring() {
    var opts = trackers.get(this),
      emitter = opts.emitter,
      connector = opts.connector,
      propsSent = opts.propsSent;

    var saveSocketMessage;
    emitter.on(EVENTS.socketdata, saveSocketMessage = function(message) {
      var props = getObjectProps(message);

      // Prevent unnecessary upserts w/caching
      var diffProps = props.filter((s) => propsSent.indexOf(s) === -1);
      if(diffProps.length < 1) return;

      connector.withMongoConnection(function(err, db) {
        if (err) return console.log('error trying connecting to database');

        diffProps.forEach(function(fieldPath) {
          db.collection('socketdata_fields').update({
              field_path: fieldPath
            }, {
              $setOnInsert: {
                field_path: fieldPath,
                first_detected_message: message
              }
            }, {
              upsert: true
            },
            function(err) {
              if(err) console.log(err);
              else propsSent.push(fieldPath);
            }
          );
        });
      });
    });
    opts.monitoring = true;
    opts.listeners = {
      socketdata: saveSocketMessage
    };
  }
  stopMonitoring() {
    var opts = trackers.get(this),
      emitter = opts.emitter,
      listeners = opts.listeners;

    if (opts.monitoring) {
      throw Error('Cannot stop monitoring when you\'re not monitoring.');
    }

    emitter.removeListener(EVENTS.socketdata, listeners.socketdata);

    opts.monitoring = false;
    delete opts.listeners;
  }
}
module.exports = SocketFieldTracker;
