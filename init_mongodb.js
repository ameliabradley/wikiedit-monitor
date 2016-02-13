var fs = require('fs'),
    path = require('path'),
    mongodb = require('mongodb');

// Get the configuration
var configPath = path.join(__dirname, "config.json");
var config = JSON.parse(fs.readFileSync(configPath));
var conString = config.conString;

var MongoClient = mongodb.MongoClient;


MongoClient.connect(conString, function(err, db) {
    if (err) return console.error('error fetching client from pool', err);
    db.collection('socketdata').ensureIndex(
        {'message.revision.new': 1},
        function(err, result){
            db.close();
            if (err) return console.error('there was an error creating the index', err);
            else console.log('Index created on socketdata field "message.revision.new"', result);
        });
});
