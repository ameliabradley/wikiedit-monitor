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

         db.collection('errorlog').aggregate([
         {
             $project: {
                 document: "$$ROOT",
                 revnew: {
                     $ifNull: [ "$data.revnew", 0 ]
                 }
             }
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
             $sort: {
                 "document._id": -1,
                 "document.type": 1
             }
         }]).toArray(function( err, errorRows ) {
           if (err) {
             db.close();
             return error("db error: " + err);
           }

           if (errorRows.length === 0) {
             db.close();
             return renderContent('No errors found! :(');
           }

           var revTitleList = [];
           for(var z = 0; z < errorRows.length; z++) {
             revTitleList.push(errorRows[z].document.title);
           }

           db.collection('wikiedits').aggregate(
             [
               { $match: { title: { $in:  revTitleList } } },
               { $group: { _id: "$title", count: { $sum: 1 } } }
             ]
           ).toArray(function( err, countRows ) {
             if (err) {
               db.close();
               return error("db error: " + err);
             }

             db.close();

             var oCountsByTitle = {};
             for (var y = 0; y < countRows.length; y++) {
               var countRow = countRows[y];
               var title = countRow.title;
               var count = countRow.count;
               oCountsByTitle[title] = (count) ? count : 0;
             }

             var joinRows = [];
             for (var e = 0; e < errorRows.length; e++) {
               var errorParent = errorRows[e];
               var errorRow = errorParent.document;
               var socketdata = errorParent.socketdata[0];
               if (socketdata) {
                 var message = socketdata.message;
                 message.created = errorRow._id.getTimestamp()
                 message.type = errorRow.type;
                 message.count = oCountsByTitle[message.title] || 0;
                 joinRows.push(message);
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
         var allowedOpts = ['diff', 'title', 'errorlog'];
         return error("not recognized command. please provide query parameter with values from the following options: [" + allowedOpts.join(', ') + "]." );
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
