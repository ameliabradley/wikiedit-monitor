var loader = require('auto-loader'),
    fs = require('fs'),
    path = require('path');

var modules = loader.load(__dirname + '/src');

// Get the configuration
var configPath = path.join(__dirname, "config.json");
var config = JSON.parse(fs.readFileSync(configPath));

var editLog = new modules.EditLog.EditLog(config);
editLog.start();
