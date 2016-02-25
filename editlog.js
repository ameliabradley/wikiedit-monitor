var fs = require('fs'),
	http = require('https'),
	path = require('path'),
   sprintf = require("sprintf-js").sprintf,
   util = require('util'),
   io = require('socket.io-client')
   mongodb = require('mongodb'),
   debounce = require('debounce');

var MongoClient = mongodb.MongoClient;

// Get the configuration
var configPath = path.join(__dirname, "config.json");
var config = JSON.parse(fs.readFileSync(configPath));
var conString = config.conString;

// This app caches revs and queries the diffs in bulk
const MAX_MS_BETWEEN_REQUESTS = 10000;
const MIN_REVS_UNTIL_REQUEST = 20;
const MAX_REQUEST_REVS = 50;
const MAX_NOTCACHED_RETRIES = 50;
const DEFAULT_MAX_RECONNECTION_ATTEMPTS = 13;

// Caching / App state
var oRevsToGetDiffs = [];
var iNumRevsToGetDiffs = 0;
var iLastRequest = null;
var oBadDiffs = {};

function logError (revnew, type, data, url, bConsole) {
   //if (bConsole === false) console.log(type, util.inspect(data, { showHidden: false, depth: null }));
   
  MongoClient.connect(conString, function(err, db) {
    if (err) return console.error('error fetching client from pool', err);

    db.collection('errorlog').insertOne( {
      revnew: revnew,
      type: type,
      data: data,
      url: url
    }, function(err, result) {
      db.close();
      if (err) return console.error('error inserting an error into the errorlog collection', err);
    });
  });
}

function saveSocketUpdate (record) {
   //if (bConsole === false) console.log(type, util.inspect(data, { showHidden: false, depth: null }));
   
  MongoClient.connect(conString, function(err, db) {
    if (err) return console.error('error fetching client from pool', err);

    db.collection('socketdata').insertOne( record,
        function(err, result) {
          db.close();
          if (err) return console.error('error inserting an socket data record into the socketdata collection', err);
        });
  });
}

function doQuery (aRecords, fnComplete, iTries) {
  var iBeforeQuery = (new Date()).getTime();

  MongoClient.connect(conString, function(err, db) {
    if (err) return console.error('error fetching client from pool', err);

    db.collection('wikiedits').insert(aRecords,
      function(err, result) {
        db.close();
        if (err) console.error('error inserting an edit into the wikiedits collection', err);
 
        var iAfterQuery = (new Date()).getTime();
        fnComplete(iAfterQuery - iBeforeQuery);

     });
  });
}

function attemptRetryForBadDiff(revid, data, strError, page, strUrl) {
   if (oBadDiffs[revid]) {
      oBadDiffs[revid]++;
   } else {
      oBadDiffs[revid] = 1;
   }

   // Strikes until I'm not querying for this revision's diff anymore
   if (oBadDiffs[revid] > MAX_NOTCACHED_RETRIES) {
      // Something's wrong with this revision! :(
      // NOTE: Usually happens with an admin's revdelete revision
      // EX: https://en.wikipedia.org/w/api.php?action=query&prop=revisions&format=json&rvdiffto=prev&revids=696894315
      // but sometimes it's just the server cache being unusually slow

      // TODO: I should go back and look at previously logged revisions for this page
      // to see if any I've logged have been deleted
      // Keep in mind though, there MAY be revdelete types that don't exhibit this behavior?
      
      logError(revid, "GAVE UP REQUERYING: " + strError, page, strUrl, false);
      delete oBadDiffs[revid];
   } else {
      //console.log("***** BADREV (" + revid.toString() + ") " + strError);
      oRevsToGetDiffs[revid] = data;
      iNumRevsToGetDiffs++;
   }
}

function doBulkQuery () {
   iLastRequest = (new Date()).getTime();

   var originalRevs = oRevsToGetDiffs;
   var originalRevIds = Object.keys(oRevsToGetDiffs);
   var keepRevIds = originalRevIds.slice(MAX_REQUEST_REVS);
   var aRevIds = originalRevIds.slice(0, MAX_REQUEST_REVS);

   var path = "/w/api.php?action=query&prop=revisions&format=json&rvdiffto=prev&revids=" + aRevIds.join("|");

   var opts = {
      host: 'en.wikipedia.org',
      path: path
   };

   var strUrl = opts.host + path;

   console.log('***** Requesting ' + aRevIds.length + ' diffs from Wikipedia');
   var oRevsGettingDiffs = {};
   aRevIds.forEach(function (revnew) {
      oRevsGettingDiffs[revnew] = oRevsToGetDiffs[revnew];
   });

   oRevsToGetDiffs = {};
   keepRevIds.forEach(function (revnew) {
      oRevsToGetDiffs[revnew] = originalRevs[revnew];
   });
   iNumRevsToGetDiffs = keepRevIds.length;

   var iBeforeQuery = (new Date()).getTime();
   http.get(opts, function (response) {
      var iAfterQuery = (new Date()).getTime();
      var iTotalMs = Math.round((iAfterQuery - iBeforeQuery) / 10) / 100;
      console.log('***** Wikipedia returned in ' + iTotalMs + 's');

      var body = '';

      response.on('data', function (chunk) {
         body += chunk;
      });

      response.on('end', function () {
         try {
            var parsed = JSON.parse(body);
         } catch (e) {
            // App will log an error when it realizes parsed is empty
         }

         var page;

         if (parsed && parsed.query && parsed.query.pages) {
            var oQueryByRev = {};
            var iUpdates = 0;
            Object.keys(parsed.query.pages).forEach(function (pagenum) {
               page = parsed.query.pages[pagenum];
               if (page && page.revisions) {
                  page.revisions.forEach(function (revision) {
                     var revid = revision.revid;
                     if (revision.diff && revision.diff['*']) {
                        var diff = revision.diff['*'];
                        oQueryByRev[revid] = { diff: diff };
                        iUpdates++;
                        delete oBadDiffs[revid];
                     } else if ('diff' in revision && 'notcached' in revision.diff) {
                        // This is a probably a bug where the diffs haven't been cached yet
                        // Can solve either by waiting or requesting individually
                        // SEE: https://phabricator.wikimedia.org/T31223
                        attemptRetryForBadDiff(revid, oRevsGettingDiffs[revid], "Wikipedia returned empty diff", page, strUrl);
                        delete oRevsGettingDiffs[revid];
                     } else if (revid) {
                        logError(revid, "Probably revdelete", page, strUrl);
                        delete oRevsGettingDiffs[revid];
                     } else {
                        logError(revision.revid, "bad diff", page, strUrl);
                        delete oRevsGettingDiffs[revid];
                     }
                  });
               } else {
                  logError(null, "bad revision", page, strUrl);
                  delete oRevsGettingDiffs[revid];
               }
            });

            if (iUpdates > 0) {
               var aRecords = [];
               var aKeys = Object.keys(oRevsGettingDiffs);
               aKeys.forEach(function (revnew) {
                  var oRev = oRevsGettingDiffs[revnew];
                  if (!oQueryByRev[revnew]) {
                     if(
                         parsed
                         && 'query' in parsed
                         && 'badrevids' in parsed.query
                         && revnew in parsed.query.badrevids
                         ) {
                        // If a revid is included in parsed.query.badrevids, it may be
                        // available in a later query result.
                        attemptRetryForBadDiff(revnew, oRev, "Wikipedia placed the revision in badrevids", {}, strUrl);
                     } else {
                        logError(revnew, "Wikipedia failed to return anything", body, strUrl);
                     }
                     return;
                  }

                  var oQuery = oQueryByRev[revnew];
                  aRecords.push({
                     revnew: parseInt(revnew),
                     revold: parseInt(oRev.revold),
                     title: oRev.title,
                     comment: oRev.comment,
                     wiki: oRev.wiki,
                     username: oRev.username,
                     diff: oQuery.diff
                  });
               });

               doQuery(aRecords, function (iMs) {
                  console.log("***** INSERTED " + aKeys.length + " rows in " + iMs + "ms");
               });
            }
         } else {
            logError(null, "bad pages json value", body, strUrl);
         }
      });

      response.on("error", function (err) {
         logError(null, "http error", (body || "") + err, strUrl);
      });
   });
}

function cullDeletedItems (strTitle) {
   var aRevsToDelete = [];

   console.log("Article deleted: " + strTitle);
   for (var revid in oRevsToGetDiffs) {
      if (!oRevsToGetDiffs.hasOwnProperty(revid)) continue;
      var oRev = oRevsToGetDiffs[revid];

      if (oRev.title === strTitle) {
         logError(iRevId, "Revision could not be queried because article was deleted", oRev, "", false);
         aRevsToDelete.push(revid);
      }
   }

   for (var i = 0; i < aRevsToDelete.length; i++) {
      var iRevId = aRevsToDelete[i];
      delete oRevsToGetDiffs[iRevId];
      delete oBadDiffs[iRevId];
   }

   iNumRevsToGetDiffs -= aRevsToDelete.length;

   if (aRevsToDelete.length > 0) {
      console.error("***** Not gonna query " + aRevsToDelete.length + " revision(s) because the article was deleted: " + strTitle);
   }
}

function setupSocket () {
   // Requires socket.io-client 0.9.x:
   // browser code can load a minified Socket.IO JavaScript library;
   // standalone code can install via 'npm install socket.io-client@0.9.1'.
   var socket = io.connect('stream.wikimedia.org/rc', {
     query: 'hidebots=1',
     'max reconnection attempts': config.max_reconnection_attempts || DEFAULT_MAX_RECONNECTION_ATTEMPTS
   });
   var shouldSubscribe = true;
   
   var subscribeToStream = debounce(function () {
      if(shouldSubscribe) {
        socket.emit('subscribe', 'en.wikipedia.org');
        shouldSubscribe = false;
      }
   }, 1000);

   socket.on('connect', function () {
      console.log('***** CONNECTED to stream.wikimedia.org/rc');
      subscribeToStream();
   });

   socket.on('change', function (message) {
      shouldSubscribe = false;
      /*
      { comment: 'refine category structure',
        wiki: 'enwiki',
        server_name: 'en.wikipedia.org',
        title: 'Category:Valleys of Tulare County, California',
        timestamp: 1451104944,
        server_script_path: '/w',
        namespace: 14,
        server_url: 'https://en.wikipedia.org',
        length: { new: 103, old: null },
        user: 'Hmains',
        bot: false,
        patrolled: true,
        type: 'new',
        id: 783574664,
        minor: false,
        revision: { new: 696823369, old: null } };
      */
      saveSocketUpdate({message: message})

      if (message.log_action === "delete") {
         cullDeletedItems(message.title);
         return;
      }

      //if (message.bot) return;
      var revision = message.revision;
      if ((!revision) || (!revision.old)) return;

      console.log(sprintf("%-20.20s | %-30.30s | %-30.30s", message.user, message.title, message.comment));

      var wiki = message.server_name.substring(0, 2);

      if (revision['new'] && revision.old) {
         var revnew = revision['new'];
         iNumRevsToGetDiffs++;
         oRevsToGetDiffs[revnew] = {
            revnew: parseInt(revnew),
            revold: parseInt(revision.old),
            title: message.title,
            comment: message.comment,
            wiki: wiki,
            username: message.user
         };

         if (iNumRevsToGetDiffs >= MIN_REVS_UNTIL_REQUEST) {
            var iBeforeQuery = (new Date()).getTime();
            if ((!iLastRequest) || (iBeforeQuery > (iLastRequest + MAX_MS_BETWEEN_REQUESTS))) {
               doBulkQuery();
            }
         }
      }
   });

   socket.on('disconnect', function() {
     console.log('***** Socket Disconnected');
     shouldSubscribe = true;
   });

   socket.on('connect_error', function(err){
      console.log('***** Socket Connection Error', err);
      logError(null, 'socket connect event error', err);
   });

   socket.on('reconnect_error', function(err){
      console.log('***** Socket Reconnection Error', err);
      logError(null, 'socket reconnect event error', err);
   });

   socket.on('reconnect_failed', function(){
      console.log('***** Socket Reconnection Failed');
   });

   socket.on('connect_timeout', function(){
      console.log('***** Socket Connection Timeout');
   });

   socket.on('reconnect', function(attemptNumber){
      console.log('***** Socket Reconnect ', attemptNumber);
   });

   socket.on('reconnect_attempt', function(){
      console.log('***** Socket Reconnection Attempt');
   });

   socket.on('reconnecting', function(attemptNumber){
      console.log('***** Socket Reconnecting...', attemptNumber);
   });
}

setupSocket();
