var sprintf = require("sprintf-js").sprintf,
  SocketManager = require('./SocketManager.js')
  PersistenceQueues = require('./PersistenceQueues.js')
  RevisionList = require('./RevisionList.js')
  WikiApi = require('./WikiApi.js');

function EditLog (config) {
  var self = this;
  var conString = config.conString;

  // This app caches revs and queries the diffs in bulk
  const WIKI_API_QUERY_INTERVAL = 5000;
  const MAX_REQUEST_REVS = 50;
  const MAX_NOTCACHED_RETRIES = 50;

  // Caching / App state
  var m_revisionList = new RevisionList();
  var m_queues = PersistenceQueues.queues;
  var m_wikiApi = new WikiApi(config);
  var m_socketManager;

  function logError (revnew, type, data, url, bConsole) {
    m_queues.errorlog.push({
      revnew: parseInt(revnew),
      type: type,
      data: data,
      url: url
    });
  }

  function attemptRetryForBadDiff(revid, strError, page, strUrl) {
    m_revisionList.releaseRevision(revid);

    // Strikes until I'm not querying for this revision's diff anymore
    if (m_revisionList.getReleaseCount(revid) > MAX_NOTCACHED_RETRIES) {
      // Something's wrong with this revision! :(
      // NOTE: Usually happens with an admin's revdelete revision
      // EX: https://en.wikipedia.org/w/api.php?action=query&prop=revisions&format=json&rvdiffto=prev&revids=696894315
      // but sometimes it's just the server cache being unusually slow

      // TODO: I should go back and look at previously logged revisions for this page
      // to see if any I've logged have been deleted
      // Keep in mind though, there MAY be revdelete types that don't exhibit this behavior?

      logError(revid, "GAVE UP REQUERYING: " + strError, page, strUrl, false);
      m_revisionList.purgeRevision(revid);
    }
  }

  function doBulkQuery () {
    var aRevIds = m_revisionList.reserveRevisions(MAX_REQUEST_REVS);
    m_wikiApi.getRevisions(
      aRevIds,
      function(parsed, strUrl){
        var page, oQueryByRev = {};
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
                attemptRetryForBadDiff(revid, "Wikipedia returned empty diff", page, strUrl);
              } else if (revid) {
                // One of three things has happened
                // 1) This revision is an administrative revdelete
                // 2) The previous revision was revdeleted, so it can't be diffed against
                //    (revdeletes can happen without the admin entering an additional revision)
                // 3) Wikipedia is being slow and stupid (happens often actually)

                // TODO: Let's look at the page history and get some more detail...
                /*
                var strTitle = page.title;
                var strUrl = "https://en.wikipedia.org/w/index.php?action=history&title=Internet%20of%20Things";
                http.get(strUrl, function (response) {
                  var body = "";

                  response.on('data', function (chunk) {
                    body += chunk;
                  });

                  response.on('end', function () {
                    console.log("done");
                    //console.log(body);
                    var aDeletedRevs = [];
                    var jBody = $(body);
                    jBody.find("ul#pagehistory li input[disabled='disabled'][name='diff']").each(function (i, el) {
                      var strVal = $(this).val();
                      aDeletedRevs.push(strVal);
                    });

                    // Go to the next page for more revisions...
                    var strUrlNextPage = $("[rel='next']").attr("href");
                    console.log(aDeletedRevs);
                  });
                });
                */

                logError(revid, "Probably revdelete", page, strUrl);
                m_revisionList.purgeRevision(revid);
              } else {
                logError(revision.revid, "bad diff", page, strUrl);
                m_revisionList.purgeRevision(revid);
              }
            });
          } else {
            logError(null, "bad revision", page, strUrl);
          }
        });

        m_revisionList.reservedRevisions.forEach(function (revnew) {
          var oRev = m_revisionList.getRevisionData(revnew);
          if (!oQueryByRev[revnew]) {
            if(
              parsed
              && 'query' in parsed
              && 'badrevids' in parsed.query
              && revnew in parsed.query.badrevids
            ) {
              // If a revid is included in parsed.query.badrevids, it may be
              // available in a later query result.
              attemptRetryForBadDiff(revnew, "Wikipedia placed the revision in badrevids", {}, strUrl);
            } else {
              logError(revnew, "Wikipedia failed to return anything", parsed, strUrl);
              m_revisionList.purgeRevision(revnew);
            }
            return;
          }

          var oQuery = oQueryByRev[revnew];
          m_queues.wikiedits.push({
            revnew: parseInt(revnew),
            revold: parseInt(oRev.revold),
            title: oRev.title,
            comment: oRev.comment,
            wiki: oRev.wiki,
            username: oRev.username,
            diff: oQuery.diff
          });
          m_revisionList.purgeRevision(revnew);
        });
      },
      function (message, content, strUrl) {
        logError(null, message, content, strUrl);
        m_revisionList.releaseRevisions(aRevIds);
      }
    );
  }

  function cullDeletedItems (strTitle) {
    var iRevsDeleted = 0;

    console.log("Article deleted: " + strTitle);
    for (var revid of m_revisionList.revisions) {
      var oRev = m_revisionList.getRevisionData(revid);

      if (oRev.title === strTitle) {
        logError(iRevId, "Revision could not be queried because article was deleted", oRev, "", false);
        m_revisionList.purgeRevision(revid);
        iRevsDeleted++;
      }
    }

    if (iRevsDeleted > 0) {
      console.error("***** Not gonna query " + iRevsDeleted + " revision(s) because the article was deleted: " + strTitle);
    }
  }

  self.start = function () {
    m_socketManager = new SocketManager();
    m_socketManager.connect(
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
        m_queues.socketdata.push({message: message});

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
          m_revisionList.addRevision(revnew, {
            revnew: revnew,
            revold: parseInt(revision.old),
            title: message.title,
            comment: message.comment,
            wiki: wiki,
            username: message.user
          });
        }
      },
      function(message, err){
        logError(null, message, err);
      }
    );
    PersistenceQueues.startMonitoring(config);
    setInterval(function(){
      if(m_revisionList.count > 0 && m_wikiApi.isNewRequestAllowed()) {
        doBulkQuery();
      }
    }, WIKI_API_QUERY_INTERVAL);
  };

  self.stop = function () {
    m_socketManager.disconnect();
  };
};

module.exports = EditLog;
