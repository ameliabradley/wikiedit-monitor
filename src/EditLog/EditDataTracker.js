"use strict";

const EVENTS = require('./EventDefinitions.js'),
  PERSISTENCE_EVENTS = require('../Persistence/EventDefinitions.js');

var trackers = new WeakMap();
class EditDataTracker {
  constructor(emitter) {
    trackers.set(this, {
      emitter: emitter,
      monitoring: false
    });
  }
  startMonitoring() {
    var opts = trackers.get(this),
      emitter = opts.emitter;

    if (opts.monitoring) {
      throw Error('Cannot start monitoring more than once.');
    }

    var saveSocketMessage;
    emitter.on(EVENTS.socketdata, saveSocketMessage = function(message) {
      emitter.emit(PERSISTENCE_EVENTS.persist_data, {
        collection: 'socketdata',
        records: [{
          message: message
        }]
      });
    });

    var saveWikiEdits;
    emitter.on(EVENTS.wikiedits, saveWikiEdits = function(message) {
      if (message.edits.length) {
        emitter.emit(PERSISTENCE_EVENTS.persist_data, {
          collection: 'wikiedits',
          records: message.edits
        });
      }
    });

    var saveErrorMessage;
    emitter.on(EVENTS.logged_error, saveErrorMessage = function(message) {
      message.revnew = parseInt(message.revnew);
      emitter.emit(PERSISTENCE_EVENTS.persist_data, {
        collection: 'errorlog',
        records: [message]
      });
    });

    opts.monitoring = true;
    opts.listeners = {
      socketdata: saveSocketMessage,
      wikiedits: saveWikiEdits,
      logged_error: saveErrorMessage
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
    emitter.removeListener(EVENTS.wikiedits, listeners.wikiedits);
    emitter.removeListener(EVENTS.logged_error, listeners.logged_error);

    opts.monitoring = false;
    delete opts.listeners;
  }
}

module.exports = EditDataTracker;
