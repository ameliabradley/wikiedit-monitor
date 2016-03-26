module.exports = function(cxt, callback, errorCallback){
  if(cxt.url.query.diff) {
    var db = cxt.db;
    var revnew = cxt.url.query.diff;
    db.collection('wikiedits').find({ revnew: parseInt(revnew), wiki: cxt.wiki }).toArray(function (err, rows) {
      db.close();
      if (err) return errorCallback("db error: " + err);

      if(rows.length < 1) return errorCallback(':( No results');

      callback('query_diff.jade', {
         row: rows[0],
         wiki: cxt.wiki
      });
    });
    return true;
  } else {
    return false;
  }
};
