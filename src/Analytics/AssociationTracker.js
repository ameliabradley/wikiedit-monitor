"use strict";

const EVENTS = require('../EditLog/EventDefinitions.js'),
  PERSISTENCE_EVENTS = require('../Persistence/EventDefinitions.js');

var trackers = new WeakMap();
class AssociationTracker {
  constructor(emitter, connector) {
    trackers.set(this, {
      emitter: emitter,
      connector: connector,
      monitoring: false
    });
  }
  startMonitoring() {
    var opts = trackers.get(this),
      emitter = opts.emitter,
      connector = opts.connector;

    var saveSocketMessage;
    emitter.on(EVENTS.socketdata, saveSocketMessage = function(message) {
      emitter.emit(PERSISTENCE_EVENTS.persist_data, {
        collection: 'socketdata_last_hour',
        records: [{
          message: message,
          inserted_time: new Date()
        }]
      });
      connector.withMongoConnection(function(err, db) {
        if (err) return console.log('error trying connecting to database');
        var cursor = db.collection('socketdata_last_hour').find({
          'message.title': message.title,
          'message.wiki': message.wiki,
          'message.user': {
            $ne: message.user
          }
        });

        cursor.forEach(function(record) {
          var time = new Date();
          var hourAgo = new Date();
          hourAgo.setHours(time.getHours() - 1);

          var userPair = [
            message.user,
            record.message.user
          ].sort();

          // Commenting because this is very loud.
          //console.log('Users both editing [', message.title, ']: (', userPair[0], '), (', userPair[1], ')');

          // Detect edit wars, sock puppets, and relate users to their IP addresses
          //
          // Higher incidence for a small number of articles indicates edit wars.
          // Higher incidence spread across articles indicates user/IP relationship.
          db.collection('users_editing_same_articles').update({
              userPair: userPair,
              title: message.title,
              end_time: {
                $gte: hourAgo
              }
            }, {
              $setOnInsert: {
                userPair: userPair,
                title: message.title,
                start_time: time
              },
              $set: {
                end_time: time
              }
            }, {
              upsert: true
            },
            function() {}
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
module.exports = AssociationTracker;
