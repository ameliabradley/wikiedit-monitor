//Lets require/import the HTTP module
var http = require('http');
var pg = require('pg');
var url = require('url');
var fs = require('fs');
var path = require('path');

// get the configuration
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
   res.write("<link type='text/css' rel='stylesheet' href='http://192.168.1.203:8080/css/all.css'>");

   function error (strError) {
      res.end(strError);
   }

   pg.connect(conString, function(err, client, done) {
      if (err) return error('error fetching client from pool', err);

      var wiki = "en";

      if (urlObject.query.diff) {
         var revnew = urlObject.query.diff;
         client.query('SELECT * FROM wikiedits WHERE revnew = $1 AND wiki = $2', [revnew, wiki], function (err, result) {
            done(client);
            if (err) return error("db error: " + err);

            if (result.rows.length === 0) return res.end('Not found! :(');

            var row = result.rows[0];

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
         client.query('SELECT * FROM wikiedits WHERE title = $1 AND wiki = $2', [title, wiki], function (err, result) {
            done(client);
            if (err) return error("db error: " + err);

            if (result.rows.length === 0) return res.end('None found! :(');

            res.write("<h1>" + title);
            res.write(" <a href='http://" + wiki + ".wikipedia.org/wiki/" + title + "'>");
            res.write("(wikipedia)</a></h1>");

            res.write("<table class='edits'><tr><th>diff id</th><th>User</th><th>Comment</th></tr>");
            for (var i = 0; i < result.rows.length; i++) {
               var row = result.rows[i];

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
         client.query('SELECT * FROM errorlog AS e LEFT JOIN wikiedits we ON we.revnew = e.revnew AND we.wiki = $1 ORDER BY e.created DESC', [wiki], function (err, result) {
            done(client);
            if (err) return error("db error: " + err);

            if (result.rows.length === 0) return res.end('None found! :(');

            res.write("<h1>Error Log</h1>");
            res.write("<table class='errorlog'><tr><th>diff</th><th>timestamp</th><th>type</th><th>Title</th><th>User</th><th>Comment</th></tr>");
            for (var i = 0; i < result.rows.length; i++) {
               var row = result.rows[i];

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
                     res.write(row.type);
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
            res.end("</table>");
         });
      } else {
         error("not recognized command");
      }
   });
}

//Create a server
var server = http.createServer(handleRequest);

//Lets start our server
server.listen(PORT, function(){
    //Callback triggered when server is successfully listening. Hurray!
    console.log("Server listening on: http://localhost:%s", PORT);
});

var express = require('express');
var app = module.exports = express.createServer();

app.configure(function () {
   app.use(express.bodyParser());
   app.use(express.methodOverride());

   app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
   app.use(express.static(__dirname + '/public'));
});

app.listen(8080);
