var fs = require('fs'),
	http = require('https'),
	path = require('path'),
	_ = require('underscore');
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

// Caching / App state
var aRevsToUpdate = [];
var aRevsToInsert = [];
var iLastRequest = null;
var oBadDiffs = {};

function logError (revnew, type, data, url) {
   console.error(type, util.inspect(data, { showHidden: false, depth: null }));
   
   pg.connect(conString, function(err, client, done) {
      if (err) return console.error('error fetching client from pool', err);

      client.query('INSERT INTO errorlog (revnew, type, data, url) VALUES ($1, $2, $3, $4)', [revnew, type, data, url], function (err, result) {
         done(client);
         if (err) return console.error('error running ERROR query', err);
      });
   });
}

function doBulkQuery (client, done, aInsertGroup) {
   iLastRequest = (new Date()).getTime();
   var path = "/w/api.php?action=query&prop=revisions&format=json&rvdiffto=prev&revids=" + aInsertGroup.join("|");

   var opts = {
      host: 'en.wikipedia.org',
      path: path
   };

   var strUrl = opts.host + '/' + path;

   console.log('***** Requesting ' + aInsertGroup.length + ' diffs from Wikipedia');
   http.get(opts, function (response) {
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

         if (parsed && parsed.query && parsed.query.pages) {
            var oUpdates = {};
            var iUpdates = 0;
            Object.keys(parsed.query.pages).forEach(function (pagenum) {
               var page = parsed.query.pages[pagenum];
               if (page && page.revisions && page.revisions[0]) {
                  var revision = page.revisions[0];
                  var revid = revision.revid;
                  if (revision.diff && revision.diff['*']) {
                     var diff = revision.diff['*'];
                     oUpdates[revid] = { wiki: "en", diff: diff };
                     iUpdates++;
                     delete oBadDiffs[revid];
                  } else if (revid) {
                     // This is a bug where the diffs haven't been cached yet
                     // Can solve either by waiting or requesting individually
                     // SEE: https://phabricator.wikimedia.org/T31223

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
                        
                        logError(revid, "crazy revision", page, strUrl);
                        delete oBadDiffs[revid];
                     } else {
                        console.log("***** Wikipedia returned no diff for " + revid.toString() + ", will query again later");
                        aRevsToUpdate.push(revid);
                     }
                  } else {
                     logError(revision.revid, "bad diff", page, strUrl);
                  }
               } else {
                  logError(null, "bad revision", page, strUrl);
               }
            });

            if (iUpdates > 0) {
               var strQuery = "UPDATE wikiedits AS w SET diff = c.diff, updated = current_timestamp FROM (values ";
               var aValues = [];
               var i = 1;
               var iRowCount = 0;
               Object.keys(oUpdates).forEach(function (revnew) {
                  var oUpdate = oUpdates[revnew];

                  if (i !== 1) {
                     strQuery += ', ';
                  }

                  strQuery += ['($', i,
                     ', $', i + 1,
                     ', $', i + 2, ')'].join('');

                  i += 3;
                  iRowCount++;

                  aValues.push(parseInt(revnew), oUpdate.wiki, oUpdate.diff);
               });
               strQuery += ") AS c(revnew, wiki, diff) WHERE w.revnew = cast(c.revnew as int) AND w.wiki = c.wiki";

               var iBeforeQuery = (new Date()).getTime();
               client.query(strQuery, aValues, function (err, result) {
                  done();
                  var iAfterQuery = (new Date()).getTime();
                  console.log("***** UPDATED " + iRowCount + " rows in " + (iAfterQuery - iBeforeQuery) + "ms");
                  if (err) return console.error('error running UPDATE query', err);
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
   var socket = io.connect('stream.wikimedia.org/rc');

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

      if (message.bot) return;
      var revision = message.revision;
      if ((!revision) || (!revision.old)) return;

      console.log(sprintf("%-20.20s | %-30.30s | %-60.60s", message.user, message.title, message.comment));

      var wiki = message.server_name.substring(0, 2);

      if (revision.new && revision.old) {
         aRevsToUpdate.push(revision.new);

         aRevsToInsert.push([
            revision.new,
            revision.old,
            message.title,
            message.comment,
            wiki,
            message.user
         ]);

         if (aRevsToUpdate.length > MIN_REVS_UNTIL_REQUEST) {
            var iBeforeQuery = (new Date()).getTime();
            if ((!iLastRequest) || (iBeforeQuery > (iLastRequest + MAX_MS_BETWEEN_REQUESTS))) {
               var aInsertGroup = aRevsToUpdate;
               aRevsToUpdate = [];

               var strQuery = 'INSERT INTO wikiedits (revnew, revold, title, comment, wiki, username) VALUES ';
               var aValues = [];
               aRevsToInsert.forEach(function (aInsert, i) {
                  if (i !== 0) {
                     strQuery += ', ';
                  }

                  var y = (i * 6) + 1;
                  strQuery += ['($', y,
                     ', $', y + 1,
                     ', $', y + 2,
                     ', $', y + 3,
                     ', $', y + 4,
                     ', $', y + 5, ')'].join('');

                  aValues.push(
                     parseInt(aInsert[0]),
                     parseInt(aInsert[1]),
                     aInsert[2],
                     aInsert[3],
                     aInsert[4],
                     aInsert[5]
                  );
               });

               var iTotalRows = aRevsToInsert.length;
               aRevsToInsert = [];
               //console.log(strQuery);
               //console.log(aValues);

               pg.connect(conString, function(err, client, done) {
                  if (err) return console.error('error fetching client from pool', err);
                  client.query(strQuery, aValues, function (err, result) {
                     var iAfterQuery = (new Date()).getTime();
                     console.log("***** INSERTED " + iTotalRows + " rows in " + (iAfterQuery - iBeforeQuery) + "ms");
                     if (err) return console.error('error running INSERT query', err);
                     doBulkQuery(client, done, aInsertGroup);
                  });
               });
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
