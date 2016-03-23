var http = require('https'),
   sprintf = require("sprintf-js").sprintf,
   util = require('util'),
   io = require('socket.io-client'),
   SocketManager = require('./SocketManager.js')
   PersistenceQueues = require('./PersistenceQueues.js')
   RevisionList = require('./RevisionList.js').RevisionList;

module.exports = {};
module.exports.start = function start(config){
  var conString = config.conString;


  // This app caches revs and queries the diffs in bulk
  const MAX_MS_BETWEEN_REQUESTS = 10000;
  const MIN_REVS_UNTIL_REQUEST = 20;
  const MAX_REQUEST_REVS = 50;
  const MAX_NOTCACHED_RETRIES = 50;

  // Caching / App state
  var iLastRequest = null;
  var revisionList = new RevisionList();
  var queues = PersistenceQueues.queues;

  function logError (revnew, type, data, url, bConsole) {
    queues.errorlog.push({
        revnew: parseInt(revnew),
        type: type,
        data: data,
        url: url
      });
  }

  function attemptRetryForBadDiff(revid, data, strError, page, strUrl) {
     revisionList.releaseRevision(revid);

     // Strikes until I'm not querying for this revision's diff anymore
     if (revisionList.getReleaseCount(revid) > MAX_NOTCACHED_RETRIES) {
        // Something's wrong with this revision! :(
        // NOTE: Usually happens with an admin's revdelete revision
        // EX: https://en.wikipedia.org/w/api.php?action=query&prop=revisions&format=json&rvdiffto=prev&revids=696894315
        // but sometimes it's just the server cache being unusually slow

        // TODO: I should go back and look at previously logged revisions for this page
        // to see if any I've logged have been deleted
        // Keep in mind though, there MAY be revdelete types that don't exhibit this behavior?
        
        logError(revid, "GAVE UP REQUERYING: " + strError, page, strUrl, false);
        revisionList.purgeRevision(revid);
     }
  }

  function doBulkQuery () {
     iLastRequest = (new Date()).getTime();

     var aRevIds = revisionList.reserveRevisions(MAX_REQUEST_REVS);

     var path = "/w/api.php?action=query&prop=revisions&format=json&rvdiffto=prev&revids=" + aRevIds.join("|");

     var opts = {
        host: 'en.wikipedia.org',
        path: path
     };

     var strUrl = opts.host + path;

     console.log('***** Requesting ' + aRevIds.length + ' diffs from Wikipedia');

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
              Object.keys(parsed.query.pages).forEach(function (pagenum) {
                 page = parsed.query.pages[pagenum];
                 if (page && page.revisions) {
                    page.revisions.forEach(function (revision) {
                       var revid = revision.revid;
                       if (revision.diff && revision.diff['*']) {
                          var diff = revision.diff['*'];
                          oQueryByRev[revid] = { diff: diff };
                       } else if ('diff' in revision && 'notcached' in revision.diff) {
                          // This is a probably a bug where the diffs haven't been cached yet
                          // Can solve either by waiting or requesting individually
                          // SEE: https://phabricator.wikimedia.org/T31223
                          attemptRetryForBadDiff(revid, revisionList.getRevisionData(revid), "Wikipedia returned empty diff", page, strUrl);
                       } else if (revid) {
                          logError(revid, "Probably revdelete", page, strUrl);
                          revisionList.purgeRevision(revid);
                       } else {
                          logError(revision.revid, "bad diff", page, strUrl);
                          revisionList.purgeRevision(revid);
                       }
                    });
                 } else {
                    logError(null, "bad revision", page, strUrl);
                 }
              });

              revisionList.reservedRevisions.forEach(function (revnew) {
                 var oRev = revisionList.getRevisionData(revnew);
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
                       revisionList.purgeRevision(revnew);
                    }
                    return;
                 }

                 var oQuery = oQueryByRev[revnew];
                 queues.wikiedits.push({
                    revnew: parseInt(revnew),
                    revold: parseInt(oRev.revold),
                    title: oRev.title,
                    comment: oRev.comment,
                    wiki: oRev.wiki,
                    username: oRev.username,
                    diff: oQuery.diff
                 });
                 revisionList.purgeRevision(revnew);
              });
           } else {
              logError(null, "bad pages json value", body, strUrl);
              revisionList.releaseRevisions(aRevIds);
           }
        });

        response.on("error", function (err) {
           logError(null, "http error", (body || "") + err, strUrl);
           revisionList.releaseRevisions(aRevIds);
        });
     });
  }

  function cullDeletedItems (strTitle) {
     var iRevsDeleted = 0;

     console.log("Article deleted: " + strTitle);
     for (var revid of revisionList.revisions) {
        var oRev = revisionList.getRevisionData(revid);

        if (oRev.title === strTitle) {
           logError(iRevId, "Revision could not be queried because article was deleted", oRev, "", false);
           revisionList.purgeRevision(revid);
           iRevsDeleted++;
        }
     }

     if (iRevsDeleted > 0) {
        console.error("***** Not gonna query " + iRevsDeleted + " revision(s) because the article was deleted: " + strTitle);
     }
  }

  SocketManager.connect(
      config,
      function(message){
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
          queues.socketdata.push({message: message});

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
             var revnew = parseInt(revision['new']);
             revisionList.addRevision(revnew, {
                revnew: revnew,
                revold: parseInt(revision.old),
                title: message.title,
                comment: message.comment,
                wiki: wiki,
                username: message.user
             });

             if (revisionList.count >= MIN_REVS_UNTIL_REQUEST) {
                var iBeforeQuery = (new Date()).getTime();
                if ((!iLastRequest) || (iBeforeQuery > (iLastRequest + MAX_MS_BETWEEN_REQUESTS))) {
                   doBulkQuery();
                }
             }
          }
      },
      function(message, err){
          logError(null, message, err);
      }
  );
  PersistenceQueues.startMonitoring(config);
};
