var io = require('socket.io-client'),
    debounce = require('debounce');

module.exports = {
  connect: function connect(config, changeCallback, errorCallback){
     const DEFAULT_MAX_RECONNECTION_ATTEMPTS = 13;

     // Requires socket.io-client 0.9.x:
     // browser code can load a minified Socket.IO JavaScript library;
     // standalone code can install via 'npm install socket.io-client@0.9.1'.
     var socket = io.connect('stream.wikimedia.org/rc', {
       query: 'hidebots=1',
       'max reconnection attempts': config.max_reconnection_attempts || DEFAULT_MAX_RECONNECTION_ATTEMPTS
     });
     var shouldSubscribe = true;
     
     var subscribeToStream = debounce(function () {
        if(shouldSubscribe) {
          socket.emit('subscribe', 'en.wikipedia.org');
          shouldSubscribe = false;
        }
     }, 1000);

     socket.on('connect', function () {
        console.log('***** CONNECTED to stream.wikimedia.org/rc');
        subscribeToStream();
     });

     socket.on('change', function (message) {
        shouldSubscribe = false;
        changeCallback(message);
     });

     socket.on('disconnect', function() {
       console.log('***** Socket Disconnected');
       shouldSubscribe = true;
     });

     socket.on('connect_error', function(err){
        console.log('***** Socket Connection Error', err);
        errorCallback('socket connect event error', err);
     });

     socket.on('reconnect_error', function(err){
        console.log('***** Socket Reconnection Error', err);
        errorCallback('socket reconnect event error', err);
     });

     socket.on('reconnect_failed', function(){
        console.log('***** Socket Reconnection Failed');
     });

     socket.on('connect_timeout', function(){
        console.log('***** Socket Connection Timeout');
     });

     socket.on('reconnect', function(attemptNumber){
        console.log('***** Socket Reconnect ', attemptNumber);
     });

     socket.on('reconnect_attempt', function(){
        console.log('***** Socket Reconnection Attempt');
     });

     socket.on('reconnecting', function(attemptNumber){
        console.log('***** Socket Reconnecting...', attemptNumber);
     });
  }
};
