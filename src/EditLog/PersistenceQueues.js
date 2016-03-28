const PERSISTENCE_INTERVAL = 5000; // milliseconds
const INSERTED_RECORDS_FORMAT = '***** INSERTED (%s:%d, %s:%d, %s:%d) records in %dms';

var sprintf = require("sprintf-js").sprintf,
    MongoClient = require('mongodb').MongoClient;

var conString;

var queues = {
  errorlog: [],
  socketdata: [],
  wikiedits: []
};
Object.freeze(queues);

function persistChanges(){
  var iBeforeQuery = (new Date()).getTime();
  MongoClient.connect(conString, function(err, db) {
    if (err) return console.error('error fetching client from pool', err);

    // Used to close connection only after all queries are complete
    var closeCounter = 0;

    var errorRecords = queues.errorlog.slice();
    var socketRecords = queues.socketdata.slice();
    var wikieditRecords = queues.wikiedits.slice();

    function onClose(){
        closeCounter++;
        if(closeCounter > 2) {
          db.close();

          var iAfterQuery = (new Date()).getTime();
          var iMs = iAfterQuery - iBeforeQuery;

          console.log(sprintf(
              INSERTED_RECORDS_FORMAT, 
              'wikiedits', wikieditRecords.length,
              'socketdata', socketRecords.length,
              'errorlog', errorRecords.length,
              iMs
            ));
          setTimeout(persistChanges, PERSISTENCE_INTERVAL);
        }
    }

    if(errorRecords.length > 0) {
        db.collection('errorlog').insert(
          errorRecords,
          function(err, result) {
            onClose();
            if (err) return console.error('error inserting an error into the errorlog collection', err);
            else queues.errorlog.splice(0, errorRecords.length);
          });
    }
    else closeCounter++;

    if(socketRecords.length > 0) {
        db.collection('socketdata').insert(
          socketRecords,
          function(err, result) {
            onClose();
            if (err) return console.error('error inserting a socket data record into the socketdata collection', err);
            else queues.socketdata.splice(0, socketRecords.length);
          });
    }
    else closeCounter++;

    if(wikieditRecords.length > 0) {
        db.collection('wikiedits').insert(
          wikieditRecords,
          function(err, result) {
            onClose();
            if (err) console.error('error inserting an edit into the wikiedits collection', err);
            else queues.wikiedits.splice(0, wikieditRecords.length);
         });
    }
    else closeCounter++;
   });
}

module.exports = {
  queues: queues,
  startMonitoring: function(config){
    conString = config.conString;
    setTimeout(persistChanges, PERSISTENCE_INTERVAL);
  },
  persistChanges: persistChanges
};

