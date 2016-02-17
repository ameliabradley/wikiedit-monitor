//Lets require/import the HTTP module
var http = require('http');
var url = require('url');
var fs = require('fs');
var path = require('path');
var mongodb = require('mongodb');
var jade = require('jade');

var MongoClient = mongodb.MongoClient;

// Get the configuration
var configPath = path.join(__dirname, "config.json");
var config = JSON.parse(fs.readFileSync(configPath));
var conString = config.conString;

var dateFormat = require('dateformat');

//Lets define a port we want to listen to
const PORT=8081; 
const JADE_TEMPLATE_DIR= __dirname + '/jade_templates';
const JADE_INCLUDE_DIR= __dirname + '/jade_templates/includes';

function formatDate (date) {
   return dateFormat(date, "yyyy-mm-dd h:MM:ss");
}

//We need a function which handles requests and send res
function handleRequest(request, res){
   var urlObject = url.parse(request.url, true);
   var wiki = urlObject.query.wiki || "en";

   function error (strError) {
     if(strError && strError.toString) {
       strError = strError.toString();
     }
     console.error(strError);
     return renderContent(strError);
   }

   function renderContent (content) {
     res.writeHead(200, {'Content-Type': 'text/html'});
     jade.renderFile( JADE_TEMPLATE_DIR + '/container.jade', {
         contents: content,
         port: PORT
       },
       function(err, html){
          if(err) console.log(err);
          res.write(html);
          res.end();
        });
   }

  MongoClient.connect(conString, function(err, db) {
    if (err) return console.error('error fetching client from pool', err);

      if (urlObject.query.diff) {
         var revnew = urlObject.query.diff;
         db.collection('wikiedits').find({ revnew: parseInt(revnew), wiki: wiki }).toArray(function (err, rows) {
           db.close();
           if (err) return error("db error: " + err);

           if (rows.length === 0) return renderContent('None found! :(');

           jade.renderFile( JADE_INCLUDE_DIR + '/query_diff.jade', {
               row: rows[0],
               wiki: wiki
           }, function(err, html){
              if(err) return error(err);
              renderContent(html);
           });
         });
      } else if (urlObject.query.title) {
         var title = urlObject.query.title.replace(/_/g, " ");
         db.collection('wikiedits').find({ title: title, wiki: wiki }).toArray(function (err, rows) {
           db.close();
           if (err) return error("db error: " + err);

           if (rows.length === 0) return renderContent('None found! :(');

           jade.renderFile( JADE_INCLUDE_DIR + '/query_title.jade', {
               title: title,
               rows: rows,
               wiki: wiki
           }, function(err, html){
              if(err) return error(err);
              renderContent(html);
           });
         });
      } else if (urlObject.query.errorlog) {
         db.collection('errorlog').find({}, { revnew: 1, type: 1 }).toArray(function( err, errorRows ) {
           if (err) {
             db.close();
             return error("db error: " + err);
           }

           if (errorRows.length === 0) {
             db.close();
             return renderContent('No errors found! :(');
           }

           var revIdList = [];
           for(var z = 0; z < errorRows.length; z++) {
             revIdList.push(parseInt(errorRows[z].revnew));
           }

           db.collection('socketdata').find({ 'message.revision.new': { $in:  revIdList }, 'message.wiki': wiki + 'wiki' }).toArray(function (err, rows) {
            db.close();
            if (err) return error("db error: " + err);

            if (rows.length === 0) return renderContent('No edits matching errors found! :(');

            var joinRows = [];
            for (var e = 0; e < errorRows.length; e++) {
              var errorRow = errorRows[e];
              for (var i = 0; i < rows.length; i++) {
                 var row = rows[i].message;
                 if(parseInt(errorRow.revnew) === row.revision['new']) {
                    row.created = errorRow._id.getTimestamp()
                    row.type = errorRow.type;
                    joinRows.push(row);
                 }
              }
            }
            jade.renderFile( JADE_INCLUDE_DIR + '/query_errorlog.jade', {
                  title: title,
                  rows: joinRows,
                  wiki: wiki,
                  formatDate: formatDate
            }, function(err, html){
              if(err) return error(err);
              renderContent(html);
            });
           });
         });
      } else {
         return error("not recognized command");
      }
   });
}

//Create a server
var express = require('express');
var app = module.exports = express.createServer();

app.configure(function () {
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
  app.use(express.static(__dirname + '/public'));
});

app.get('/', handleRequest);

app.listen(PORT, function(){
    //Callback triggered when server is successfully listening. Hurray!
    console.log("Server listening on: http://localhost:%s", PORT);
});
