"use strict";

const WIKI_API_HOST = 'en.wikipedia.org';
const WIKI_API_PATH_PREFIX = '/w/api.php?action=query&prop=revisions&format=json&rvdiffto=prev&revids=';

var http;
var apis = new WeakMap();
class WikiApi {
  constructor(options) {
    // For unit testing framework support
    // See: http://stackoverflow.com/a/35433327/146054
    // ~ Lee Bradley (Mach 28th, 2016)
    if (options.port) {
      http = require('http');
    } else {
      http = require('https');
    }

    options = options || {}
    apis.set(this, {
      host: options.host || WIKI_API_HOST,
      port: options.port,
      newRequestAllowed: true
    });
  }

  _getPath(revIds) {
    return WIKI_API_PATH_PREFIX + revIds.join("|");
  }

  _getTimestamp() {
    return (new Date()).getTime();
  }

  isNewRequestAllowed() {
    return apis.get(this).newRequestAllowed;
  }

  getRevisions(revIds, successCallback, errorCallback) {
    var options = apis.get(this);

    var httpOpts = {
      hostname: options.host,
      port: options.port,
      path: this._getPath(revIds)
    };

    var strUrl = httpOpts.host + httpOpts.path;

    console.log('***** Requesting ' + revIds.length + ' diffs from Wikipedia');

    options.newRequestAllowed = false;
    var iBeforeQuery = this._getTimestamp();
    var self = this;
    http.get(httpOpts, function (response) {
      var iAfterQuery = self._getTimestamp();
      var iTotalMs = Math.round((iAfterQuery - iBeforeQuery) / 10) / 100;
      console.log('***** Wikipedia returned in ' + iTotalMs + 's');

      var strBody = '';

      response.on('data', function (chunk) {
        strBody += chunk;
      });

      response.on('end', function () {
        options.newRequestAllowed = true;

        try {
          var parsed = JSON.parse(strBody);
        } catch (e) {
          // App will log an error when it realizes parsed is empty
        }

        if (parsed && parsed.query && parsed.query.pages) {
          successCallback(parsed, strUrl);
        } else {
          errorCallback('bad pages json value', strBody, strUrl);
        }
      });

      response.on("error", function (err) {
        options.newRequestAllowed = true;
        errorCallback('http error', (strBody || ""), strUrl);
      });
    });
  }
}
module.exports = WikiApi;
