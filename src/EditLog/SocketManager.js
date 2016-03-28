var io = require('socket.io-client'),
    debounce = require('debounce');

function SocketManager () {
  var self = this;

  var m_socket;
  var m_shouldSubscribe = true;

  self.connect = function (config, changeCallback, errorCallback) {
     const DEFAULT_MAX_RECONNECTION_ATTEMPTS = 13;

     // Requires socket.io-client 0.9.x:
     // browser code can load a minified Socket.IO JavaScript library;
     // standalone code can install via 'npm install socket.io-client@0.9.1'.
     m_socket = io.connect('stream.wikimedia.org/rc', {
       query: 'hidebots=1',
       'max reconnection attempts': config.max_reconnection_attempts || DEFAULT_MAX_RECONNECTION_ATTEMPTS
     });
     
     var subscribeToStream = debounce(function () {
        if(m_shouldSubscribe) {
          m_socket.emit('subscribe', 'en.wikipedia.org');
          m_shouldSubscribe = false;
        }
     }, 1000);

     m_socket.on('connect', function () {
        console.log('***** CONNECTED to stream.wikimedia.org/rc');
        subscribeToStream();
     });

     m_socket.on('change', function (message) {
        m_shouldSubscribe = false;
        changeCallback(message);
     });

     m_socket.on('disconnect', function() {
       console.log('***** Socket Disconnected');
       m_shouldSubscribe = true;
     });

     m_socket.on('connect_error', function(err){
        console.log('***** Socket Connection Error', err);
        errorCallback('socket connect event error', err);
     });

     m_socket.on('reconnect_error', function(err){
        console.log('***** Socket Reconnection Error', err);
        errorCallback('socket reconnect event error', err);
     });

     m_socket.on('reconnect_failed', function(){
        console.log('***** Socket Reconnection Failed');
     });

     m_socket.on('connect_timeout', function(){
        console.log('***** Socket Connection Timeout');
     });

     m_socket.on('reconnect', function(attemptNumber){
        console.log('***** Socket Reconnect ', attemptNumber);
     });

     m_socket.on('reconnect_attempt', function(){
        console.log('***** Socket Reconnection Attempt');
     });

     m_socket.on('reconnecting', function(attemptNumber){
        console.log('***** Socket Reconnecting...', attemptNumber);
     });
  };

  self.disconnect = function () {
    // There seems to be literally no way of shutting this bad boy down
    //m_socket.removeAllListeners();
    //m_socket.disconnect();
  };
}

module.exports = SocketManager;
