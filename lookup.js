//Lets require/import the HTTP module
var loader = require('auto-loader'),
  http = require('http'),
  url = require('url'),
  fs = require('fs'),
  path = require('path'),
  jade = require('jade'),
  MongoClient = require('mongodb').MongoClient,
  wikiDb = null;

var modules = loader.load(__dirname + '/src');

// Get the configuration
var configPath = path.join(__dirname, "config.json");
var config = JSON.parse(fs.readFileSync(configPath));
var conString = config.conString;

//Lets define a port we want to listen to
const PORT = 8081;
const JADE_TEMPLATE_DIR = __dirname + '/jade_templates';
const JADE_INCLUDE_DIR = __dirname + '/jade_templates/includes';

//We need a function which handles requests and send res
function handleRequest(request, res) {
  var urlObject = url.parse(request.url, true);
  var wiki = urlObject.query.wiki || "en";

  function error(strError) {
    if (strError && strError.toString) {
      strError = strError.toString();
    }
    console.error(strError);
    return renderContent(strError);
  }

  function renderContent(content) {
    res.writeHead(200, {
      'Content-Type': 'text/html'
    });
    jade.renderFile(JADE_TEMPLATE_DIR + '/container.jade', {
        contents: content,
        port: PORT
      },
      function(err, html) {
        if (err) console.log(err);
        res.write(html);
        res.end();
      });
  }

  function renderSimpleTemplate(template, params) {
    jade.renderFile(
      JADE_INCLUDE_DIR + '/' + template,
      params,
      function(err, html) {
        if (err) return error(err);
        renderContent(html);
      });
  }

  function renderJsonResponse(jsObj) {
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(jsObj));
  }

  var context = {
    url: urlObject,
    wiki: wiki,
    db: wikiDb
  };

  modules.Lookup.DiffSearch(context, renderSimpleTemplate, error) || modules.Lookup.TitleSearch(context, renderSimpleTemplate, error) || modules.Lookup.ErrorLog(context, renderSimpleTemplate, error) || modules.Lookup.ErrorLog.ajaxCall(context, renderJsonResponse, error) || modules.Lookup.Dashboard(context, renderSimpleTemplate, error) || modules.Lookup.Dashboard.ajaxCall(context, renderJsonResponse, error) || error('Oops, that page does not exist.');
}

//Create a server
var express = require('express');
var app = module.exports = express.createServer();

app.configure(function() {
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.errorHandler({
    dumpExceptions: true,
    showStack: true
  }));
  app.use(express.static(__dirname + '/public'));
});

app.get('/', handleRequest);

MongoClient.connect(conString, function(err, db) {
  if (err) {
    console.log('Failed to connect to database, aborting.', err);
    return;
  }
  wikiDb = db;
  app.listen(PORT, function() {
    //Callback triggered when server is successfully listening. Hurray!
    console.log("Server listening on: http://localhost:%s", PORT);
  });
});
