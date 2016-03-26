module.exports = function(cxt, callback, errorCallback){
  if(cxt.url.query.title) {
    var db = cxt.db;
    var title = cxt.url.query.title.replace(/_/g, " ");
    db.collection('wikiedits').find({ title: title, wiki: cxt.wiki }).toArray(function (err, rows) {
      db.close();
      if (err) return errorCallback("db error: " + err);

      callback('query_title.jade', {
         title: title,
         rows: rows,
         wiki: cxt.wiki
      });
    });
    return true;
  } else {
    return false;
  }
};
