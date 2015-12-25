// imports

var fs = require('fs'),
    http = require('https'),
    path = require('path'),
    _ = require('underscore'),
    sio = require('socket.io'),
    express = require('express'),
    wikichanges = require('wikichanges');

// get the configuration

var configPath = path.join(__dirname, "config.json");
var config = JSON.parse(fs.readFileSync(configPath));
var app = module.exports = express.createServer();
var requestCount = 0;

// get the wikipedia shortnames sorted by their longname

var wikisSorted = [];
for (var chan in wikichanges.wikipedias) wikisSorted.push(chan);
wikisSorted.sort(function (a, b) {
  w1 = wikichanges.wikipedias[a].long;
  w2 = wikichanges.wikipedias[b].long;
  if (w1 == w2) return 0;
  else if (w1 < w2) return -1;
  else if (w1 > w2) return 1;
});

// set up the web app

app.configure(function () {
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  //app.use(redirectOldPort);
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
});

app.configure('development', function () {
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
  app.use(express.static(__dirname + '/public'));
});

app.configure('production', function () {
  app.use(express.errorHandler()); 
  app.use(express.static(__dirname + '/public', {maxAge: 60*15*1000}));
});

app.get('/', function (req, res){
  res.render('index', {
    title: 'wikistream',
    wikis: wikichanges.wikipedias,
    wikisSorted: wikisSorted,
    stream: true
  });
});

app.get('/commons-image/:page', function (req, res){
// Ain't nobody got time fo dat
   return;

  var path = "/w/api.php?action=query&titles=" + 
             encodeURIComponent(req.params.page) + 
             "&prop=imageinfo&iiprop=url|size|comment|user&format=json";
  var opts = {
    headers: {'User-Agent': 'wikistream'},
    host: 'commons.wikimedia.org',
    path: path
  };
  http.get(opts, function (response) {
    res.setHeader('Cache-Control', 'public, max-age=1000')

    //res.header('Content-Type', 'application/json');
    response.on('data', function (chunk) {
      res.write(chunk);
    });
    response.on('end', function () {
      res.end();
    });
  });
});

app.get('/about/', function (req, res){
  res.render('about', {
    title: 'about wikistream',
    stream: false,
    trends: false
  });
});

app.listen(config.port);

// set up socket.io to stream the irc updates

//var io = sio.listen(app);

var changes = new wikichanges.WikiChanges({ircNickname: config.ircNickname});
var pg = require('pg');
var conString = "postgres://elephanthunter:@localhost/elephanthunter";
var url = require('url');
var aBulkQuery = [];
pg.connect(conString, function(err, client, done) {
   function doBulkQuery() {
      var path = "/w/api.php?action=query&prop=revisions&format=json&rvdiffto=prev&revids=" + aBulkQuery.join("|");
      aBulkQuery = [];

      var opts = {
         headers: {'User-Agent': 'editoid'},
         host: 'en.wikipedia.org',
         path: path
      };

      console.log('performing diff query', aBulkQuery.join(', '));
      http.get(opts, function (response) {
         var body = '';

         response.on('data', function (chunk) {
            body += chunk;
         });

         response.on('end', function () {
            var parsed = JSON.parse(body);

            if (parsed && parsed.query && parsed.query.pages) {
               Object.keys(parsed.query.pages).forEach(function (pagenum) {
                  var page = parsed.query.pages[pagenum];
                  if (page && page.revisions && page.revisions[0]) {
                     var revision = page.revisions[0];
                     if (revision.diff && revision.diff['*']) {
                        var diff = revision.diff['*'];
                        client.query('UPDATE wikipediaedits SET diff = $1 WHERE idiff = $2 AND "wikipediaShort" = $3', [diff, revision.revid, "en"], function (err, result) {
                           console.log('updated rev with diff', revision.revid);

                           if(err) {
                              return console.error('error running query', err);
                           }
                        });
                     } else {
                        console.error('bad diff');
                     }
                  } else {
                     console.error('bad revision');
                  }
               });
            } else {
               console.error('bad pages json value');
            }
         });
      });
   }

   console.log('connected to db');
   if (err) {
      return console.error('error fetching client from pool', err);
   }

   changes.listen(function(message) {

   //client.query('SELECT $1::int AS number', ['1'], function(err, result) {
   if (!message.robot) {
      if (!message.url) return;
      if (message.wikipediaShort !== "en") return;

      //io.sockets.emit('message', message);

      var iDiff,
         iOldId,
         iRcId;

      /*
      var aParts = message.url.match(/diff=([^&]+)&oldid=(.+)$/);
      if (aParts) {
         iDiff = aParts[1];
         iOldId = aParts[2];
      } else {
         // I don't fully understand this URL format
         // https://ar.wikipedia.org/w/index.php?oldid=17809785&rcid=24496233
         aParts = message.url.match(/oldid=([^&]+)&rcid=(.+)$/);

         if (aParts) {
            iOldId = aParts[1];
            iRcId = aParts[2];
         } else {
            aParts = message.url.match(/oldid=([^&]+)$/);
            iOldId = aParts[1];
         }
      }
      */

      var urlParts = url.parse(message.url, true);

/*
{  
   "name":"message",
   "args":[  
      {  
         "channel":"#ru.wikipedia",
         "flag":"B",
         "page":"Пресли, Элвис",
         "pageUrl":"http://ru.wikipedia.org/wiki/Пресли,_Элвис",
         "url":"https://ru.wikipedia.org/w/index.php?diff=75301254&oldid=75234871",
         "delta":-127,
         "comment":"- \"19380615-parents_1973191i.jpg\". Файл удалён с Commons участником [[commons:User:Didym|Didym]]. Причина: Per [[:c:Commons:Deletion requests/Files uploaded by Retro-redakteur.u12|]].",
         "wikipedia":"Russian Wikipedia",
         "wikipediaUrl":"http://ru.wikipedia.org",
         "wikipediaShort":"ru",
         "wikipediaLong":"Russian Wikipedia",
         "user":"CommonsDelinker",
         "userUrl":"http://ru.wikipedia.org/wiki/User:CommonsDelinker",
         "unpatrolled":false,
         "newPage":false,
         "robot":true,
         "anonymous":false,
         "namespace":"article"
      }
   ]
}
*/

      var query = urlParts.query;
      client.query('INSERT INTO wikipediaedits (idiff, oldid, rcid, title, comment, "wikipediaShort", "user") VALUES ($1, $2, $3, $4, $5, $6, $7)', [
            query.diff,
            query.oldid,
            query.rcid,
            message.page,
            message.comment,
            message.wikipediaShort,
            message.user
         ], function(err, result) {
         //call `done()` to release the client back to the pool
         //done();

         console.log('logged edit', message.page, ' --- ', message.comment, ' --- ', message.user);

         if (query.diff && query.oldid) {
            aBulkQuery.push(query.diff);

            if (aBulkQuery.length > 20) {
               doBulkQuery();
            }
         }

         if(err) {
            return console.error('error running query', err);
         }
         //console.log(result.rows[0].number);
         //output: 1
      });
   }

     // /w/api.php?action=query&prop=revisions&format=json&rvprop=ids%7Ctimestamp%7Cuser%7Cuserid%7Ccomment&rvdiffto=prev&revids=696430065|696696637
     //console.log('test', message.pageUrl);
   });
});

/*
io.configure('production', function () {
  io.set('log level', 2);
});
*/

// some proxy environments might not support all socketio's transports

//io.set('transports', config.transports);

/* this is only really needed on inkdroid.org where wikistream was initially
 * deployed to inkdroid.org:3000 and cited there, which resulted
 * in google using inkdroid.org:3000 as the canonical URL for wikistream
 * this bit of middleware will permanently redirect :3000 requests that 
 * bypass the proxy to wikistream.inkdroid.org. Hopefully Google will 
 * update their index :-)
 */

function redirectOldPort(req, res, next) {
  if (req.header('host') == 'inkdroid.org:3000' 
          && ! req.header('x-forwarded-for')) {
    res.redirect('http://wikistream.inkdroid.org' + req.url, 301);
  } else {
    next();
  }
}
