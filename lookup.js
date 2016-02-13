//Lets require/import the HTTP module
var http = require('http');
var pg = require('pg');
var url = require('url');
var fs = require('fs');
var path = require('path');
var mongodb = require('mongodb');

var MongoClient = mongodb.MongoClient;

// Get the configuration
var configPath = path.join(__dirname, "config.json");
var config = JSON.parse(fs.readFileSync(configPath));
var conString = config.conString;

var dateFormat = require('dateformat');

//Lets define a port we want to listen to
const PORT=8081; 

function formatDate (date) {
   return dateFormat(date, "yyyy-mm-dd h:MM:ss");
}

//We need a function which handles requests and send res
function handleRequest(request, res){
   var urlObject = url.parse(request.url, true);

   res.writeHead(200, {'Content-Type': 'text/html'});
   res.write("<link type='text/css' rel='stylesheet' href='http://localhost:" + PORT + "/css/all.css'>");
      var wiki = "en";

   function error (strError) {
      res.end(strError);
   }

  MongoClient.connect(conString, function(err, db) {
    if (err) return console.error('error fetching client from pool', err);

      if (urlObject.query.diff) {
         var revnew = urlObject.query.diff;
         db.collection('wikiedits').find({ revnew: revnew, wiki: wiki }).toArray(function (err, rows) {
           db.close();
           if (err) return error("db error: " + err);

           if (rows.length === 0) return res.end('None found! :(');

            var row = rows[0];

            res.write("<h1><a href='/?title=" + row.title + "'>" + row.title + "</a></h1>");
            res.write("<b>User:</b> <a href='http://" + wiki + ".wikipedia.org/wiki/User:" + row.user + "'>");
            res.write(row.user);
            res.write("</a><br>");

            res.write("<b>Comment:</b> <i>");
            res.write(row.comment);
            res.write("</i><br>");

            res.write("<table style='white-space: pre-wrap'>");
            if (row.diff) {
               res.write(row.diff);
            } else {
               res.write("<tr><td>Empty :(</td></tr>");
            }
            res.end("</table>");
         });
      } else if (urlObject.query.title) {
         var title = urlObject.query.title.replace(/_/g, " ");
         db.collection('wikiedits').find({ title: title, wiki: wiki }).toArray(function (err, rows) {
           db.close();
           if (err) return error("db error: " + err);

           if (rows.length === 0) return res.end('None found! :(');

            res.write("<h1>" + title);
            res.write(" <a href='http://" + wiki + ".wikipedia.org/wiki/" + title + "'>");
            res.write("(wikipedia)</a></h1>");

            res.write("<table class='edits'><tr><th>diff id</th><th>User</th><th>Comment</th></tr>");
            for (var i = 0; i < rows.length; i++) {
               var row = rows[i];

               res.write("<tr>");
                  res.write("<td>");
                     res.write("<a href='?diff=" + row.revnew + "'>");
                     res.write(row.revnew.toString());
                     res.write("</a>");
                  res.write("</td>");

                  res.write("<td class='user'>");
                     res.write("<a href='http://" + wiki + ".wikipedia.org/wiki/User:" + row.user + "'>");
                     res.write(row.user || "");
                     res.write("</a>");
                  res.write("</td>");

                  res.write("<td class='comment'>");
                     res.write("<i>");
                     res.write(row.comment || "");
                     res.write("</i>");
                  res.write("</td>");
               res.write("</tr>");
            }
            res.end("</table>");
         });
      } else if (urlObject.query.errorlog) {
         db.collection('errorlog').find({}, { revnew: 1, type: 1 }).toArray(function( err, errorRows ) {
           if (err) {
             db.close();
             return error("db error: " + err);
           }

           if (rows.length === 0) {
             db.close();
             return res.end('No errors found! :(');
           }

           var revIdList = [];
           for(var z = 0; z < errorRows.length; z++) {
             revIdList.push(errorRows[i].revnew);
           }

           db.collection('wikiedits').find({ revnew: { $in:  revIdList }, wiki: wiki }).toArray(function (err, rows) {
            db.close();
            if (err) return error("db error: " + err);

            if (rows.length === 0) return res.end('No edits matching errors found! :(');

            res.write("<h1>Error Log</h1>");
            res.write("<table class='errorlog'><tr><th>diff</th><th>timestamp</th><th>type</th><th>Title</th><th>User</th><th>Comment</th></tr>");
            for (var e = 0; e < errorRows.length; e++) {
              var errorRow = errorRows[e];
              for (var i = 0; i < rows.length; i++) {
                 var row = rows[i];
                 if(errorRow.revnew !== row.revnew) continue;

                 res.write("<tr>");
                    res.write("<td>");
                       if (row.revnew) {
                          res.write("<a href='?diff=" + row.revnew + "'>");
                          res.write("(logged)");
                          res.write("</a>");

                          res.write(" <a href='https://" + wiki + ".wikipedia.org/w/api.php?action=query&prop=revisions&format=json&rvdiffto=prev&revids=" + row.revnew + "'>");
                          res.write("(wikipedia)");
                          res.write("</a>");
                       }
                    res.write("</td>");

                    res.write("<td>");
                       res.write(formatDate(row.created));
                    res.write("</td>");

                    res.write("<td>");
                       res.write(errorRow.type);
                    res.write("</td>");

                    res.write("<td class='title'>");
                       if (row.title) {
                          res.write("<a href='?title=" + row.title + "'>");
                          res.write(row.title);
                          res.write("</a>");
                       }
                    res.write("</td>");

                    res.write("<td class='user'>");
                       if (row.user) {
                          res.write("<a href='http://" + wiki + ".wikipedia.org/wiki/User:" + row.user + "'>");
                          res.write(row.user);
                          res.write("</a>");
                       }
                    res.write("</td>");

                    res.write("<td class='comment'>");
                       if (row.comment) {
                          res.write("<i>");
                          res.write(row.comment);
                          res.write("</i>");
                       }
                    res.write("</td>");
                 res.write("</tr>");
              }
            }
            res.end("</table>");
           });
         });
      } else {
         error("not recognized command");
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
