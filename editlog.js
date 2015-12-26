// imports
var fs = require('fs'),
	http = require('https'),
	path = require('path'),
	_ = require('underscore');
   pg = require('pg'),
   sprintf = require("sprintf-js").sprintf,
   util = require('util'),
   io = require('socket.io-client');

// get the configuration
var configPath = path.join(__dirname, "config.json");
var config = JSON.parse(fs.readFileSync(configPath));
var conString = config.conString;

var aBulkQuery = [];
var iLastDiff = null;
var oBadDiffs = {};

function logError (idiff, type, data, url) {
   console.error(type, util.inspect(data, { showHidden: false, depth: null }));
   
   pg.connect(conString, function(err, client, done) {
      if (err) return console.error('error fetching client from pool', err);

      client.query('INSERT INTO errorlog (idiff, type, data, url) VALUES ($1, $2, $3, $4)', [idiff, type, data, url], function (err, result) {
         done(client);
         if (err) return console.error('error running ERROR query', err);
      });
   });
}

pg.connect(conString, function(err, client, done) {
   if (err) return console.error('error fetching client from pool', err);

   function doBulkQuery () {
      iLastDiff = (new Date()).getTime();

      var path = "/w/api.php?action=query&prop=revisions&format=json&rvdiffto=prev&revids=" + aBulkQuery.join("|");
      aBulkQuery = [];

      var opts = {
         host: 'en.wikipedia.org',
         path: path
      };

      var strUrl = opts.host + '/' + path;

      console.log('performing diff query');
      http.get(opts, function (response) {
         var body = '';

         response.on('data', function (chunk) {
            body += chunk;
         });

         response.on('end', function () {
            var parsed = JSON.parse(body);

            if (parsed && parsed.query && parsed.query.pages) {
               Object.keys(parsed.query.pages).forEach(function (pagenum) {
                  var page = parsed.query.pages[pagenum];
                  if (page && page.revisions && page.revisions[0]) {
                     var revision = page.revisions[0];
                     var revid = revision.revid;
                     if (revision.diff && revision.diff['*']) {
                        var diff = revision.diff['*'];
                        delete oBadDiffs[revid];

                        client.query('UPDATE wikipediaedits SET diff = $1, updated = current_timestamp WHERE idiff = $2 AND "wikipediaShort" = $3', [diff, revision.revid, "en"], function (err, result) {
                           if (err) return console.error('error running INSERT query', err);
                        });
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
                           logError(revid, "crazy revision", page, strUrl);
                           delete oBadDiffs[revid];
                        } else {
                           console.log("empty rev, pushing off", revid);
                           aBulkQuery.push(revid);
                        }
                     } else {
                        logError(revision.revid, "bad diff", page, strUrl);
                     }
                  } else {
                     logError(null, "bad revision", page, strUrl);
                  }
               });
            } else {
               logError(null, "bad pages json value", page, strUrl);
            }
         });
      });
   }

   // Requires socket.io-client 0.9.x:
   // browser code can load a minified Socket.IO JavaScript library;
   // standalone code can install via 'npm install socket.io-client@0.9.1'.
   var socket = io.connect('stream.wikimedia.org/rc');

   socket.on('connect', function () {
      console.log('connected');
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

      var wikipediaShort = message.server_name.substring(0, 2);

      client.query('INSERT INTO wikipediaedits (idiff, oldid, rcid, title, comment, "wikipediaShort", "user") VALUES ($1, $2, $3, $4, $5, $6, $7)', [
            revision.new,
            revision.old,
            null,
            message.title,
            message.comment,
            wikipediaShort,
            message.user
         ], function(err, result) {

         if (revision.new && revision.old) {
            aBulkQuery.push(revision.new);

            if (aBulkQuery.length > 20) {
               if ((!iLastDiff) || ((new Date()).getTime() > (iLastDiff + 10000))) {
                  doBulkQuery();
               }
            }
         }

         if (err) return console.error('error running CLIENT query', err);
      });
   });
});
