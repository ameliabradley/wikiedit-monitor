function dashboardView(cxt, callback) {
  if (Object.keys(cxt.url.query).length < 1) {
    callback('dashboard.jade', {});
    return true;
  } else {
    return false;
  }
}

dashboardView.ajaxCall = function(cxt, callback, errorCallback) {
  if (cxt.url.query.dash_socketdata) {
    if(
        cxt.url.query.time_start
        && cxt.url.query.time_end
    ) {
        var wiki = cxt.wiki;
        var db = cxt.db;
        db.collection('socketdata')
          .find({
            'message.timestamp': {
                $lt: parseInt(cxt.url.query.time_end),
                $gte: parseInt(cxt.url.query.time_start)
            },
            'message.wiki': wiki + 'wiki'
          })
          .toArray(function(error, data) {
            if (error) errorCallback(error);
            callback(null, {
              wiki: wiki,
              data: data
            });
          });
    } else {
        var err = new Error('time_start and time_end query parameters are required');
        callback(err, undefined, 422);
        return true;
    }
    return true;
  }
  return false;
}

module.exports = dashboardView;
