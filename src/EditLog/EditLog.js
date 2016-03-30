const  sprintf = require("sprintf-js").sprintf,
       SocketManager = require('./SocketManager.js'),
       RevisionList = require('./RevisionList.js'),
       WikiApi = require('./WikiApi.js'),
       EVENTS = require('./EventDefinitions.js');

function EditLog (config, m_eventEmitter) {
  var self = this;
  var conString = config.conString;

  function fieldExists(obj, fieldPath) {
    if(fieldPath.length < 1) {
      throw new Error('fieldExists requires a string with a length greater than 1');
    }

    if(obj) {
      for(var f of fieldPath.split('.')) {
        if(f in obj) {
          obj = obj[f];
        } else {
          return false;
        }
      }

      return true;
    } else {
      return false;
    }
  }
  // This app caches revs and queries the diffs in bulk
  const WIKI_API_QUERY_INTERVAL = 5000;
  const MAX_REQUEST_REVS = 50;
  const MAX_NOTCACHED_RETRIES = 50;

  // Caching / App state
  var m_revisionList = new RevisionList();
  var m_wikiApi = new WikiApi(config);

  function logError (revnew, type, data, url, bConsole) {
    m_eventEmitter.emit(EVENTS.logged_error, {
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
     } else {
       m_eventEmitter.emit(EVENTS.save_revision_for_retry, {
         revid: revid,
         revision: m_revisionList.getRevisionData(revid),
         strError: strError,
         page: page,
         strUrl: strUrl
       });
     }
  }

  function doBulkQuery () {
    var aRevIds = m_revisionList.reserveRevisions(MAX_REQUEST_REVS);
    m_wikiApi.getRevisions(
         aRevIds,
         function(parsed, strUrl){
           var wikiedits = [];
           var rejected = {
             not_cached: [],
             bad_diff: [],
             revdelete: [],
             bad_rev_id: [],
             returned_nothing: []
           };
           for(var pagenum of Object.keys(parsed.query.pages)) {
             var page = parsed.query.pages[pagenum];
             if (page && page.revisions) {
               for(var revision of page.revisions) {
                 var revid = revision.revid;
                 if (fieldExists(revision, 'diff.*')) {
                   var oRev = m_revisionList.getRevisionData(revid);
                   wikiedits.push({
                     revnew: parseInt(revid),
                     revold: parseInt(oRev.revold),
                     title: oRev.title,
                     comment: oRev.comment,
                     wiki: oRev.wiki,
                     username: oRev.username,
                     diff: revision.diff['*']
                   });
                   m_revisionList.purgeRevision(revid);
                 } else if (fieldExists(revision, 'diff.notcached')) {
                   // This is a probably a bug where the diffs haven't been cached yet
                   // Can solve either by waiting or requesting individually
                   // SEE: https://phabricator.wikimedia.org/T31223
                   rejected.not_cached.push(m_revisionList.getRevisionData(revid));
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
                   rejected.revdelete.push(m_revisionList.getRevisionData(revid));
                   m_revisionList.purgeRevision(revid);
                 } else {
                   logError(revid, "bad diff", page, strUrl);
                   rejected.bad_diff.push(m_revisionList.getRevisionData(revid));
                   m_revisionList.purgeRevision(revid);
                 }
               }
             } else {
               logError(null, "bad revision", page, strUrl);
             }
           }

           for(var revnew of m_revisionList.reservedRevisions) {
             if(fieldExists(parsed, 'query.badrevids.' + revnew)) {
               // If a revid is included in parsed.query.badrevids, it may be
               // available in a later query result.
               rejected.bad_rev_id.push(m_revisionList.getRevisionData(revid));
               attemptRetryForBadDiff(revnew, "Wikipedia placed the revision in badrevids", {}, strUrl);
             } else {
               logError(revnew, "Wikipedia failed to return anything", parsed, strUrl);
               rejected.returned_nothing.push(m_revisionList.getRevisionData(revid));
               m_revisionList.purgeRevision(revnew);
             }
           }

           m_eventEmitter.emit(EVENTS.wikiedits, {
             response: parsed,
             url: strUrl,
             edits: wikiedits,
             rejected: rejected
           });
         },
         function (message, content, strUrl) {
            logError(null, message, content, strUrl);
        m_revisionList.releaseRevisions(aRevIds);
         }
     );
  }

  function cullDeletedItems (strTitle, message) {
     var iRevsDeleted = 0;

     var deletedRevisions = [];
     for (var revid of m_revisionList.revisions) {
        var oRev = m_revisionList.getRevisionData(revid);

        if (oRev.title === strTitle) {
           deletedRevisions.push(oRev);
           logError(iRevId, "Revision could not be queried because article was deleted", oRev, "", false);
        m_revisionList.purgeRevision(revid);
           iRevsDeleted++;
        }
     }

     m_eventEmitter.emit(EVENTS.article_deleted, {
       title: strTitle,
       socketdata: message,
       deletedRevisionCount: iRevsDeleted,
       deletedRevisions: deletedRevisions
     });
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
          m_eventEmitter.emit(EVENTS.socketdata, message);

          if (message.log_action === "delete") {
             cullDeletedItems(message.title, message);
             return;
          }

          //if (message.bot) return;
          var revision = message.revision;
          if ((!revision) || (!revision.old)) return;

          var wiki = message.server_name.substring(0, 2);

          if (revision['new'] && revision.old) {
             var revnew = parseInt(revision['new']);
             var foundRevision = {
                revnew: revnew,
                revold: parseInt(revision.old),
                title: message.title,
                comment: message.comment,
                wiki: wiki,
                username: message.user
             };
             m_revisionList.addRevision(revnew, foundRevision);
             m_eventEmitter.emit(EVENTS.revision_found, foundRevision);
          }
      },
      function(message, err){
          logError(null, message, err);
      }
  );
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
