var io = require('primus-socket.io-client'),
  debounce = require('debounce');

function SocketManager() {
  var self = this;

  const DEFAULT_MAX_RECONNECTION_ATTEMPTS = 13;
  const RECONNECT_TIMEOUT_MS = 120000; // 2 Minutes

  var m_socket;
  var m_connectFunction;

  self.reconnect = function(){
    m_socket.disconnect();
    m_socket = undefined;
    delete require.cache[require.resolve('primus-socket.io-client')]
    io = require('primus-socket.io-client');
    m_connectFunction();
  };
  self.connect = function(config, changeCallback, errorCallback) {

    m_connectFunction = function(){
      // Requires socket.io-client 0.9.x:
      // browser code can load a minified Socket.IO JavaScript library;
      // standalone code can install via 'npm install socket.io-client@0.9.1'.
      m_socket = io.connect('stream.wikimedia.org/rc', {
        query: 'hidebots=1',
        'max reconnection attempts': config.max_reconnection_attempts || DEFAULT_MAX_RECONNECTION_ATTEMPTS
      });
      var shouldSubscribe = true;
      var reconnectTimeout = setTimeout(self.reconnect, RECONNECT_TIMEOUT_MS);
      function bumpTime(){
        if(typeof reconnectTimeout !== undefined) {
	  clearTimeout(reconnectTimeout);
	  reconnectTimeout = setTimeout(function(){
	    reconnectTimeout = undefined;
            self.reconnect()
          }, RECONNECT_TIMEOUT_MS);
        }
      }

      var subscribeToStream = debounce(function() {
        if (shouldSubscribe) {
          m_socket.emit('subscribe', 'en.wikipedia.org');
          shouldSubscribe = false;
        }
      }, 1000);

      m_socket.on('connect', function() {
        bumpTime();
        console.log('***** CONNECTED to stream.wikimedia.org/rc');
        subscribeToStream();
      });

      m_socket.on('change', function(message) {
        bumpTime();
        shouldSubscribe = false;
        changeCallback(message);
      });

      m_socket.on('disconnect', function() {
        bumpTime();
        console.log('***** Socket Disconnected');
        shouldSubscribe = true;
      });

      m_socket.on('connect_error', function(err) {
        bumpTime();
        console.log('***** Socket Connection Error', err);
        errorCallback('socket connect event error', err);
      });

      m_socket.on('reconnect_error', function(err) {
        bumpTime();
        console.log('***** Socket Reconnection Error', err);
        errorCallback('socket reconnect event error', err);
      });

      m_socket.on('reconnect_failed', function() {
        bumpTime();
        console.log('***** Socket Reconnection Failed');
      });

      m_socket.on('connect_timeout', function() {
        bumpTime();
        console.log('***** Socket Connection Timeout');
      });

      m_socket.on('reconnect', function(attemptNumber) {
        bumpTime();
        console.log('***** Socket Reconnect ', attemptNumber);
      });

      m_socket.on('reconnect_attempt', function() {
        bumpTime();
        console.log('***** Socket Reconnection Attempt');
      });

      m_socket.on('reconnecting', function(attemptNumber) {
        bumpTime();
        console.log('***** Socket Reconnecting...', attemptNumber);
      });
    };
    m_connectFunction();
  };

  self.disconnect = function() {
    m_socket.disconnect();
    m_socket = undefined;
    delete require.cache[require.resolve('primus-socket.io-client')]
    io = require('primus-socket.io-client');
  };
}

module.exports = SocketManager;
