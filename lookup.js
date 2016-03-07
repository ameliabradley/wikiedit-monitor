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
       jade.renderFile( JADE_INCLUDE_DIR + '/query_errorlog.jade', {
             title: title,
             wiki: wiki,
             formatDate: formatDate
       }, function(err, html){
         if(err) return error(err);
         renderContent(html);
       });
      } else if (urlObject.query.errorlogquery) {
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

         var start = (urlObject.query.start) ? parseInt(urlObject.query.start) : 0;
         var length = (urlObject.query.length) ? parseInt(urlObject.query.length) : 10;


         var oMatch = {};

         var strType = urlObject.query["columns[0][search][value]"];
         if (strType) { oMatch.type = new RegExp(strType, "i"); }

         var strTitle = urlObject.query["columns[2][search][value]"];
         if (strTitle) { oMatch["data.title"] = new RegExp(strTitle, "i"); }

         var strUser = urlObject.query["columns[3][search][value]"];
         if (strUser) { oMatch["data.revisions.user"] = new RegExp(strUser, "i"); }

         var strComment = urlObject.query["columns[4][search][value]"];
         if (strComment) { oMatch["data.revisions.comment"] = new RegExp(strComment, "i"); }

         var strSearchValue = urlObject.query["search[value]"];
         if (strSearchValue) {
            var rxSearchbox = new RegExp(strSearchValue, "i");
            oMatch["$or"] = [
               { type: rxSearchbox },
               { "data.title": rxSearchbox },
               { "data.revisions.user": rxSearchbox },
               { "data.revisions.comment": rxSearchbox }
            ];
         }

         db.collection('errorlog').aggregate([
         {
            $match: oMatch
         },
         {
            $skip: start
         },
         {
            $limit: length,
         },
         {
             $project: {
                 document: "$$ROOT",
                 revnew: {
                     $ifNull: [ "$data.revnew", { $ifNull: [ "$revnew", 0 ] } ]
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
         }]).toArray(function( err, errorRows ) {
           if (err) {
             db.close();
             return error("db error: " + err);
           }

           var revTitleList = [];
           var socketdata;
           for(var z = 0; z < errorRows.length; z++) {
             socketdata = errorRows[z].socketdata[0];
             if (socketdata && socketdata.message) {
                revTitleList.push(socketdata.message.title);
             }
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

             var oCountsByTitle = {};
             for (var y = 0; y < countRows.length; y++) {
               var countRow = countRows[y];
               var title = countRow._id;
               var count = countRow.count;
               oCountsByTitle[title] = (count) ? count : 0;
             }

             var joinRows = [];
             for (var e = 0; e < errorRows.length; e++) {
               var errorParent = errorRows[e];
               var errorRow = errorParent.document;
               var socketdata = errorParent.socketdata[0];

               var message;
               if (socketdata) {
                 message = socketdata.message;
               } else {
                  // Missing socket data
                  message = {
                      "comment" : "",
                      "wiki" : "",
                      "server_name" : "",
                      "title" : "Missing socket data for errorlog revnew "
                        + errorRow.revnew,
                      "timestamp" : 0,
                      "server_script_path" : "/w",
                      "namespace" : 0,
                      "server_url" : "",
                      "length" : {
                          "new" : 0,
                          "old" : 0
                      },
                      "user" : "",
                      "bot" : false,
                      "type" : "edit",
                      "id" : 0,
                      "minor" : true,
                      "revision" : {
                          "new" : 0,
                          "old" : 0
                      }
                  };
               }

               message.created = dateFormat(errorRow._id.getTimestamp());
               message.type = errorRow.type;
               message.wiki = wiki;
               message.count = oCountsByTitle[message.title] || 0;
               joinRows.push(message);
             }

             db.collection('errorlog').count(oMatch, function (err, iFilteredCount) {
                if (err) {
                   console.log(err);
                }

                db.collection('errorlog').count(function (err, iTotalCount) {
                   db.close();

                   if (err) {
                      console.log(err);
                      return;
                   }

                   res.setHeader('Content-Type', 'application/json');
                   res.send(JSON.stringify({
                     wiki: wiki,
                     start: start,
                     length: length,
                     recordsFiltered: iFilteredCount,
                     recordsTotal: iTotalCount,
                     data: joinRows
                   }));
                });
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
