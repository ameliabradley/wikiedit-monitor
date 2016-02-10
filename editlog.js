var fs = require('fs'),
	http = require('https'),
	path = require('path'),
   pg = require('pg'),
   sprintf = require("sprintf-js").sprintf,
   util = require('util'),
   io = require('socket.io-client');

// Get the configuration
var configPath = path.join(__dirname, "config.json");
var config = JSON.parse(fs.readFileSync(configPath));
var conString = config.conString;

// This app caches revs and queries the diffs in bulk
var MAX_MS_BETWEEN_REQUESTS = 10000;
var MIN_REVS_UNTIL_REQUEST = 20;
var MAX_REQUEST_REVS = 50;

// Caching / App state
var oRevsToGetDiffs = [];
var iNumRevsToGetDiffs = 0;
var iLastRequest = null;
var oBadDiffs = {};

function logError (revnew, type, data, url, bConsole) {
   //if (bConsole === false) console.log(type, util.inspect(data, { showHidden: false, depth: null }));
   
   pg.connect(conString, function(err, client, done) {
      if (err) return console.error('error fetching client from pool', err);

      client.query('INSERT INTO errorlog (revnew, type, data, url) VALUES ($1, $2, $3, $4)', [revnew, type, data, url], function (err, result) {
         done(client);
         if (err) return console.error('error running ERROR query', err);
      });
   });
}

function doQuery (strQuery, aValues, fnComplete, iTries) {
   var iBeforeQuery = (new Date()).getTime();
   pg.connect(conString, function(err, client, done) {
      if (err) return console.error('error fetching client from pool', err);
      client.query(strQuery, aValues, function (err, result) {
         // Release the client to the pool
         done();

         if (err) {
            console.error('client.query error on', strQuery.substr(0, 10), "...", err);
            // For some reason I can't accurately detect this string
            /*
            if (err.toString() == "[Error: Connection terminated]") {
               console.error('retrying connection...');
               setTimeout(function () {
                  doQuery(strQuery, aValues, fnComplete);
               }, 1000);
            } else {
               return;
            }
            */
         }

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

   // Three strikes and I'm not querying for this revision's diff anymore
   if (oBadDiffs[revid] > 3) {
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
                     } else if (revid) {
                        // This is a probably a bug where the diffs haven't been cached yet
                        // Can solve either by waiting or requesting individually
                        // SEE: https://phabricator.wikimedia.org/T31223
                        attemptRetryForBadDiff(revid, oRevsGettingDiffs[revid], "Wikipedia returned empty diff", page, strUrl);
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
               var strQuery = 'INSERT INTO wikiedits (revnew, revold, title, comment, wiki, username, diff) VALUES ';
               var aValues = [];
               var aKeys = Object.keys(oRevsGettingDiffs);
               var i = 0;
               aKeys.forEach(function (revnew) {
                  var oRev = oRevsGettingDiffs[revnew];
                  if (!oQueryByRev[revnew]) {
                     attemptRetryForBadDiff(revnew, oRevsGettingDiffs[revnew], "Wikipedia failed to return anything", page, strUrl);
                     return;
                  }

                  if (i !== 0) {
                     strQuery += ', ';
                  }

                  var y = (i * 7) + 1;
                  strQuery += ['($', y,
                     ', $', y + 1,
                     ', $', y + 2,
                     ', $', y + 3,
                     ', $', y + 4,
                     ', $', y + 5,
                     ', $', y + 6, ')'].join('');

                  i++;
                  var oQuery = oQueryByRev[revnew];
                  aValues.push(
                     parseInt(revnew),
                     parseInt(oRev.revold),
                     oRev.title,
                     oRev.comment,
                     oRev.wiki,
                     oRev.username,
                     oQuery.diff
                  );
               });

               doQuery(strQuery, aValues, function (iMs) {
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

function setupSocket () {
   // Requires socket.io-client 0.9.x:
   // browser code can load a minified Socket.IO JavaScript library;
   // standalone code can install via 'npm install socket.io-client@0.9.1'.
   var socket = io.connect('stream.wikimedia.org/rc', { query: 'hidebots=1' });

   socket.on('connect', function () {
      console.log('***** CONNECTED to stream.wikimedia.org/rc');
      socket.emit('subscribe', 'en.wikipedia.org');
   });

   socket.on('change', function (message) {
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

   socket.on('error', function (err) {
      logError(null, "http error", err);
      setTimeout(setupSocket, 10000);
   });
}

setupSocket();
