function dashboardView(cxt, callback){
  if(Object.keys(cxt.url.query).length < 1) {
    cxt.db.close();
    callback('dashboard.jade', {});
    return true;
  } else {
    return false;
  }
}

module.exports = dashboardView;
