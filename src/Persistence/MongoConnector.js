"use strict";

const sprintf = require("sprintf-js").sprintf,
  MongoClient = require('mongodb').MongoClient,
  ERROR_MISSING_CONFIG = 'The configuration value %s is missing; it\'s required to %s.';

var mongos = new WeakMap();
class MongoConnector {
  constructor(conString) {
    if (!conString) {
      var errorMessage = sprintf(ERROR_MISSING_CONFIG, 'conString', 'connect to the database');
      console.log(errorMessage);
      throw new Error(errorMessage);
    }

    mongos.set(this, {
      conString: conString
    });
  }

  withMongoConnection(callback) {
    var options = mongos.get(this);

    if (options.db) {
      callback(null, options.db);
    } else {
      var conString = options.conString;
      MongoClient.connect(conString, function(err, db) {
        if (err) {
          if (db) db.close();
          console.error('error fetching client from pool', err);
        } else {
          options.db = db;
        }
        callback(err, db);
      });
    }
  }

  insertData(collection, records, callback) {
    if (records.length < 1) {
      callback();
      return;
    }
    this.withMongoConnection(function(err, db) {
      if (err) {
        callback(err);
        return;
      }
      db.collection(collection).insert(
        records,
        function(err, result) {
          callback(err, result);
        }
      );
    });
  }

}

module.exports = MongoConnector;
