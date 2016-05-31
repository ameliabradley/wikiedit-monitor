var dateFormat = require('dateformat');

function formatDate(date) {
  return dateFormat(date, "yyyy-mm-dd h:MM:ss");
}

function errorView(cxt, callback) {
  if (cxt.url.query.errorlog) {
    callback('query_errorlog.jade', {
      wiki: cxt.wiki,
      formatDate: cxt.formatDate
    });
    return true;
  } else {
    return false;
  }
}

errorView.ajaxCall = function(cxt, callback) {
  // TODO: Use aggregate function
  /*
  db.getCollection('errorlog').aggregate([
  {
     $match: {
         revnew: { $ne: null }
     },
  },
  {
     $lookup: {
       from: "socketdata",
       localField: "revnew",
       foreignField: "message.revision.new",
       as: "socketdata"
     }
  },
  {
     $lookup: {
       from: "wikiedits",
       localField: "revnew",
       foreignField: "revnew",
       as: "wikiedit"
     }
  },
  {
     $sort: {
         _id: -1,
         type: 1
     }
  }])
  */
  if (!cxt.url.query.errorlogquery) {
    return false;
  }

  var url = cxt.url;
  var wiki = cxt.wiki;
  var db = cxt.db;

  var start = (url.query.start) ? parseInt(url.query.start) : 0;
  var length = (url.query.length) ? parseInt(url.query.length) : 10;


  var oMatch = {};

  var strType = url.query["columns[0][search][value]"];
  if (strType) {
    oMatch.type = new RegExp(strType, "i");
  }

  var strTitle = url.query["columns[2][search][value]"];
  if (strTitle) {
    oMatch["data.title"] = new RegExp(strTitle, "i");
  }

  var strUser = url.query["columns[3][search][value]"];
  if (strUser) {
    oMatch["data.revisions.user"] = new RegExp(strUser, "i");
  }

  var strComment = url.query["columns[4][search][value]"];
  if (strComment) {
    oMatch["data.revisions.comment"] = new RegExp(strComment, "i");
  }

  var strSearchValue = url.query["search[value]"];
  if (strSearchValue) {
    var rxSearchbox = new RegExp(strSearchValue, "i");
    oMatch["$or"] = [{
      type: rxSearchbox
    }, {
      "data.title": rxSearchbox
    }, {
      "data.revisions.user": rxSearchbox
    }, {
      "data.revisions.comment": rxSearchbox
    }];
  }

  db.collection('errorlog').aggregate([{
    $match: oMatch
  }, {
    $skip: start
  }, {
    $limit: length,
  }, {
    $project: {
      document: "$$ROOT",
      revnew: {
        $ifNull: ["$data.revnew", {
          $ifNull: ["$revnew", 0]
        }]
      }
    }
  }, {
    $lookup: {
      from: "socketdata",
      localField: "revnew",
      foreignField: "message.revision.new",
      as: "socketdata"
    }
  }]).toArray(function(err, errorRows) {
    if (err) {
      callback(err, undefined, 500);
      return;
    }

    var revTitleList = [];
    var socketdata;
    for (var z = 0; z < errorRows.length; z++) {
      socketdata = errorRows[z].socketdata[0];
      if (socketdata && socketdata.message) {
        revTitleList.push(socketdata.message.title);
      }
    }

    db.collection('wikiedits').aggregate(
      [{
        $match: {
          title: {
            $in: revTitleList
          }
        }
      }, {
        $group: {
          _id: "$title",
          count: {
            $sum: 1
          }
        }
      }]
    ).toArray(function(err, countRows) {
      if (err) {
        callback(err, undefined, 500);
        return;
      }

      var oCountsByTitle = {};
      for (var y = 0; y < countRows.length; y++) {
        var countRow = countRows[y];
        var title = countRow._id;
        var count = countRow.count;
        oCountsByTitle[title] = (count) ? count : 0;
      }

      var joinRows = [];
      for (var e = 0; e < errorRows.length; e++) {
        var errorParent = errorRows[e];
        var errorRow = errorParent.document;
        var socketdata = errorParent.socketdata[0];

        var message;
        if (socketdata) {
          message = socketdata.message;
        } else {
          // Missing socket data
          message = {
            "comment": "",
            "wiki": "",
            "server_name": "",
            "title": "Missing socket data for errorlog revnew " + errorRow.revnew,
            "timestamp": 0,
            "server_script_path": "/w",
            "namespace": 0,
            "server_url": "",
            "length": {
              "new": 0,
              "old": 0
            },
            "user": "",
            "bot": false,
            "type": "edit",
            "id": 0,
            "minor": true,
            "revision": {
              "new": 0,
              "old": 0
            }
          };
        }

        message.created = formatDate(errorRow._id.getTimestamp());
        message.type = errorRow.type;
        message.wiki = wiki;
        message.count = oCountsByTitle[message.title] || 0;
        joinRows.push(message);
      }

      db.collection('errorlog').count(oMatch, function(err, iFilteredCount) {
        if (err) {
          console.log(err);
        }

        db.collection('errorlog').count(function(err, iTotalCount) {
          if (err) {
            console.log(err);
            return;
          }

          callback(null, {
            wiki: wiki,
            start: start,
            length: length,
            recordsFiltered: iFilteredCount,
            recordsTotal: iTotalCount,
            data: joinRows
          });
        });
      });
    });
  });

  return true;
};

module.exports = errorView;
