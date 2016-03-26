var loader = require('auto-loader'),
    fs = require('fs'),
    sprintf = require("sprintf-js").sprintf,
    path = require('path'),
    EventEmitter = require('events');

var modules = loader.load(__dirname + '/src');

// Get the configuration
var configPath = path.join(__dirname, "config.json");
var config = JSON.parse(fs.readFileSync(configPath));

var emitter = new EventEmitter();

var EVENTS = modules.EditLog.EventDefinitions,
    persister = new modules.EditLog.PeriodicPersister({
      conString: config.conString,
      emitter: emitter
    });
    
// Previous socket data logging
// emitter.on(EVENTS.socketdata, function(message){
//   console.log(sprintf("%-20.20s | %-30.30s | %-30.30s", message.user, message.title, message.comment));
// });
    
// Log outcomes of attempts to fetch revision data
emitter.on(EVENTS.wikiedits, function(message){
  console.log('-'.repeat(90));
  console.log('| Saving ' + message.edits.length + ' edits.' + ' '.repeat(73 - (message.edits.length + '').length) + '|');
  for(var type of Object.keys(message.rejected)) {
    if(message.rejected[type].length) {
      console.log('|' + '-'.repeat(88) + '|');
      console.log('| Rejected [' + type + ']' + ' '.repeat(76 - type.length) + '|');
      console.log('|' + '-'.repeat(88) + '|');
      for(var rev of message.rejected[type]) {
        if(rev) {
          console.log(sprintf("| %-20.20s | %-30.30s | %-30.30s |", rev.username, rev.title, rev.comment));
        }
      }
    }
  }
  console.log('-'.repeat(90));
});

// Log article deletions
emitter.on(EVENTS.article_deleted, function(message){
   console.log("Article deleted: " + message.title);

   if (message.deletedRevisionCount > 0) {
      console.error("***** Not gonna query " + message.deletedRevisionCount + " revision(s) because the article was deleted: " + message.title);
   }
});

persister.startMonitoring();

modules.EditLog.EditLog.start(config, emitter);
