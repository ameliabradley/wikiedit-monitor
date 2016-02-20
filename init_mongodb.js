var fs = require('fs'),
    path = require('path'),
    mongodb = require('mongodb'),
    async = require('async'),
    sprintf = require('sprintf');

// These values were chosen based on the size at
// which these collections seem to be growing.
const COLLECTION_SIZE_FACTOR_WIKIEDITS = .9;
const COLLECTION_SIZE_FACTOR_ERRORLOG = .0002;
const COLLECTION_SIZE_FACTOR_SOCKETDATA = .0998;

const ERROR_MESSAGE_INDEX = 'There was an error creating the index %s on the collection "%s".';
const ERROR_MESSAGE_CAPPED = 'There was an error creating the capped collection "%s" with the size [%s bytes].';

const SUCCESS_MESSAGE_INDEX = 'Successfully created the index %s on the collection "%s".';
const SUCCESS_MESSAGE_CAPPED = 'Successfully created the capped collection "%s" with the size [%s bytes].';

// Get the configuration
var configPath = path.join(__dirname, "config.json");
var config = JSON.parse(fs.readFileSync(configPath));
var conString = config.conString;

var MongoClient = mongodb.MongoClient;

function withMongoConnection(callback) {
  MongoClient.connect(conString, function(err, db) {
    if (err) console.error('error fetching client from pool', err);
    callback(err, db);
  });
}

function createCappedCollection(collection, size, callback) {
  withMongoConnection(function(err, db){
    if(err) callback(err, null);
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

var dbChanges = {};
if(config.cap_collections) {
  dbChanges.wikiedits_cap = function(callback) {
    var size = (config.cap_total_size * COLLECTION_SIZE_FACTOR_WIKIEDITS);
    var collection = 'wikiedits';
    createCappedCollection(collection, size, callback);
  };
  dbChanges.errorlog_cap = function(callback) {
    var size = (config.cap_total_size * COLLECTION_SIZE_FACTOR_ERRORLOG);
    var collection = 'errorlog';
    createCappedCollection(collection, size, callback);
  };
  dbChanges.socketdata_cap = function(callback) {
    var size = (config.cap_total_size * COLLECTION_SIZE_FACTOR_SOCKETDATA);
    var collection = 'socketdata';
    createCappedCollection(collection, size, callback);
  };
}

dbChanges.socketdata_new_revision_index = function(callback) {
  var collection = 'socketdata';
  var index = {'message.revision.new': 1, 'message.wiki': 1};
  createCollectionIndex(collection, index, callback);
};

dbChanges.socketdata_new_revision_and_wiki_index = function(callback) {
  var collection = 'wikiedits';
  var index = {'revnew': 1, 'wiki': 1};
  createCollectionIndex(collection, index, callback);
};

dbChanges.socketdata_title_and_wiki_index = function(callback) {
  var collection = 'wikiedits';
  var index = {'title': 1, 'wiki': 1};
  createCollectionIndex(collection, index, callback);
};

// Do all the DB initialization queries in parallel
async.parallel(dbChanges, function(err, resultList) {
  if(err) console.error('MongoDB initialization encountered errors:', err);
  else console.error('MongoDB initialization completed.');
});
