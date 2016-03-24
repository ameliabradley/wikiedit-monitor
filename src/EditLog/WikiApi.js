"use strict";

const WIKI_API_HOST = 'en.wikipedia.org';
const WIKI_API_PATH_PREFIX = '/w/api.php?action=query&prop=revisions&format=json&rvdiffto=prev&revids=';

var http = require('https');

var apis = new WeakMap();
class WikiApi {
  constructor(options) {
    options = options || {}
    apis.set(this, {
      host: options.host || WIKI_API_HOST,
      newRequestAllowed: true,
      pathFunction: options.pathFunction || function(revIds) {
        return WIKI_API_PATH_PREFIX + revIds.join("|");
      }
    });
  }
  isNewRequestAllowed() {
    return apis.get(this).newRequestAllowed;
  }
  getRevisions(revIds, successCallback, errorCallback) {
     var options = apis.get(this);

     var httpOpts = {
        host: options.host,
        path: options.pathFunction(revIds)
     };

     var strUrl = httpOpts.host + httpOpts.path;

     console.log('***** Requesting ' + revIds.length + ' diffs from Wikipedia');

     options.newRequestAllowed = false;
     var iBeforeQuery = (new Date()).getTime();
     http.get(httpOpts, function (response) {
        var iAfterQuery = (new Date()).getTime();
        var iTotalMs = Math.round((iAfterQuery - iBeforeQuery) / 10) / 100;
        console.log('***** Wikipedia returned in ' + iTotalMs + 's');

        var body = '';

        response.on('data', function (chunk) {
           body += chunk;
        });

        response.on('end', function () {
           options.newRequestAllowed = true;
           try {
              var parsed = JSON.parse(body);
           } catch (e) {
              // App will log an error when it realizes parsed is empty
           }

           if (parsed && parsed.query && parsed.query.pages) {
             successCallback(parsed, strUrl);
           } else {
             errorCallback('bad pages json value', body, strUrl);
           }
        });

        response.on("error", function (err) {
            options.newRequestAllowed = true;
            errorCallback('http error', (body || ""), strUrl);
        });
     });
  }
}
module.exports = WikiApi;
