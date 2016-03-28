"use strict";

// These values were chosen based on the size at
// which these collections seem to be growing.
const COLLECTION_SIZE_FACTOR_WIKIEDITS = .9;
const COLLECTION_SIZE_FACTOR_ERRORLOG = .0002;
const COLLECTION_SIZE_FACTOR_SOCKETDATA = .0998;

const ERROR_MESSAGE_INDEX = 'There was an error creating the index %s on the collection "%s".';
const SUCCESS_MESSAGE_INDEX = 'Successfully created the index %s on the collection "%s".';

const ERROR_MESSAGE_CAPPED = 'There was an error creating the capped collection "%s" with the size [%d bytes].';
const SUCCESS_MESSAGE_CAPPED = 'Successfully created the capped collection "%s" with the size [%d bytes].';
const SKIPPED_MESSAGE_CAPPED = 'Skipped creating a capped collection "%s".';

const ERROR_MISSING_CONFIG = 'The configuration value %s is missing; it\'s required to %s.';

var mongodb = require('mongodb'),
    async = require('async'),
    sprintf = require('sprintf');

var MongoClient = mongodb.MongoClient;

function InitDb (config) {
  var self = this;

  function withMongoConnection(callback) {
    if(config.conString) {
      MongoClient.connect(config.conString, function(err, db) {
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

  function createCappedCollection(collection, size, callback) {
    if(config.cap_collections) {
      if(config.cap_total_size) {
        withMongoConnection(function(err, db){
          if(err) return callback(err, null);
          db.createCollection(collection, {
              capped:true,
              size: size
            }, function(err, result){

              if(err) {
                console.error(sprintf(ERROR_MESSAGE_CAPPED, collection, size), err);
              } else {
                console.log(sprintf(SUCCESS_MESSAGE_CAPPED, collection, size));
              }

              callback(err, { err:err, result:result });
              db.close();
            });
        });
      } else {
        var errorMessage = sprintf(ERROR_MISSING_CONFIG, 'cap_total_size', 'create capped collections');
        console.log(errorMessage);

        var error = new Error(errorMessage);
        callback(error, {});
      }
    } else {
      console.log(sprintf(SKIPPED_MESSAGE_CAPPED, collection));
      callback(null, {});
    }
  }

  function createCollectionIndex(collection, index, callback) {
    withMongoConnection(function(err, db){
      if(err) return callback(err, null);
      db.collection(collection).createIndex(
          index,
          function(err, result){
            if(err) {
              console.error(sprintf(ERROR_MESSAGE_INDEX, JSON.stringify(index), collection), err);
            } else {
              console.log(sprintf(SUCCESS_MESSAGE_INDEX, JSON.stringify(index), collection));
            }

            callback(err, { result: result });
            db.close();
          });
    });
  }

  var dbChanges = [
    function(callback) {
      var size = (config.cap_total_size * COLLECTION_SIZE_FACTOR_WIKIEDITS);
      var collection = 'wikiedits';
      createCappedCollection(collection, size, callback);
    },

    function(callback) {
      var size = (config.cap_total_size * COLLECTION_SIZE_FACTOR_ERRORLOG);
      var collection = 'errorlog';
      createCappedCollection(collection, size, callback);
    },

    function(callback) {
      var size = (config.cap_total_size * COLLECTION_SIZE_FACTOR_SOCKETDATA);
      var collection = 'socketdata';
      createCappedCollection(collection, size, callback);
    },

    function(callback) {
      var collection = 'socketdata';
      var index = {'message.revision.new': 1, 'message.wiki': 1};
      createCollectionIndex(collection, index, callback);
    },

    function(callback) {
      var collection = 'wikiedits';
      var index = {'revnew': 1, 'wiki': 1};
      createCollectionIndex(collection, index, callback);
    },

    function(callback) {
      var collection = 'wikiedits';
      var index = {'title': 1, 'wiki': 1};
      createCollectionIndex(collection, index, callback);
    }
  ];

  self.initialize = function (fnComplete, fnError) {
    // Do all the DB initialization queries in parallel
    async.parallel(dbChanges, function(err, resultList) {
      if (err) {
        console.error('MongoDB initialization encountered errors:', err);
        if (fnError) fnError(err);
      } else {
        console.error('MongoDB initialization completed.');
        if (fnComplete) fnComplete(err);
      }
    });
  }
}

module.exports = InitDb;
