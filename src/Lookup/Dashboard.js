function dashboardView(cxt, callback){
  if(Object.keys(cxt.url.query).length < 1) {
    callback('dashboard.jade', {});
    return true;
  } else {
    return false;
  }
}

dashboardView.ajaxCall = function(cxt, callback, errorCallback){
  if(cxt.url.query.dash_socketdata) {
    var wiki = cxt.wiki;
    var db = cxt.db;
    db.collection('socketdata_last_hour')
        .find({'message.wiki': wiki + 'wiki'})
        .toArray(function(error, data){
            if(error) errorCallback(error);
            callback({
              wiki: wiki,
              data: data
            });
        });
    return true;
  }
  return false;
}

module.exports = dashboardView;
