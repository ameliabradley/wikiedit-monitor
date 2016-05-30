"use strict";

const LISTEN_TIME_MAX = 300000, // 5 minutes
      LISTEN_TIME_MIN = 250, // 0.25 seconds
      EVENTS = require('../EditLog/EventDefinitions.js'),
      PERSISTENCE_EVENTS = require('../Persistence/EventDefinitions.js'),
      WebSocketServer = require('ws').Server;

var server = new WeakMap();
class EventServer {
    constructor(wsConfig, emitter) {
        if(typeof wsConfig !== 'object') {
            throw new Error('EventServer requires an object as its first parameter '
                    + 'to configure the websocket server. See https://github.com/websockets/ws for details.');
        }

        server.set(this, {
            wsConfig: wsConfig,
            ws: undefined,
            emitter: emitter,
            listeners: {},
            clients: [],
            started: false
        });
    }
    startServer() {
        var state = server.get(this);
        if(state.started) {
            throw new Error('WebSocket server already started.');
        }
        var wss = new WebSocketServer(state.wsConfig);
        wss.on('connection', function(ws) {
            var config = {
                timeout: 1000,
                editLogEvents: {},
                persistenceEvents: {}
            };
            var subState = {
                timeout: undefined,
                editLogEventFunctions: {},
                persistenceEventFunctions: {}
            };

            function sendEvent(type, data) {
                ws.send(JSON.stringify({
                    eventType: type,
                    data: data
                }));
            }

            ws.on('open', function(){
                // Bind edit log events
                for(var lev of Object.keys(config.editLogEvents)){
                    if(! (lev in subState.editLogEventFunctions)) {
                        var levFunc = sendEvent.bind(null, lev);
                        subState.editLogEventFunctions[lev] = levFunc;
                        state.emitter.on(EVENTS[lev], levFunc);
                    }
                }

                // Bind persistence events
                for(var pev of Object.keys(config.persistenceEvents)){
                    if( ! (pev in subState.persistenceEventFunctions)) {
                        var pevFunc = sendEvent.bind(null, pev);
                        subState.persistenceEventFunctions[pev] = pevFunc;
                        state.emitter.on(PERSISTENCE_EVENTS[pev], pevFunc);
                    }
                }
            });

            ws.on('close', function(){
                // Unbind edit log events
                for(var olev of Object.keys(subState.editLogEventFunctions)) {
                    var folev = subState.editLogEventFunctions[olev];
                    state.emitter.removeListener(EVENTS[olev], folev);
                    delete subState.editLogEventFunctions[olev];
                }

                // Unbind persistence events
                for(var opev of Object.keys(subState.persistenceEventFunctions)) {
                    var fopev = subState.persistenceEventFunctions[opev];
                    state.emitter.removeListener(PERSISTENCE_EVENTS[opev], fopev);
                    delete subState.persistenceEventFunctions[opev];
                }
            });

            ws.on('message', function(rawMessage){
                var message = JSON.parse(rawMessage);
                if( ! (message && 'type' in message)) {
                    ws.send(JSON.stringify({ status: 'error', description: 'missing message content or type' }));
                    return;
                }

                switch(message.type) {
                    case 'config':
                        if( ! ('config' in message && typeof message.config === 'object')) {
                            ws.send(JSON.stringify({ status: 'error', description: 'unsupported message type' }));
                            return;
                        }

                        // Validate and set timeout field from client-provided configuration
                        if('timeout' in message.config) {
                            var newTimeout = parseInt(message.config.timeout);
                            if(newTimeout > LISTEN_TIME_MAX || newTimeout < LISTEN_TIME_MIN) {
                                ws.send(JSON.stringify({
                                    status: 'error',
                                    description: 'timeout must be less than ' + LISTEN_TIME_MAX
                                        + ' and greater than ' + LISTEN_TIME_MIN
                                }));
                                return;
                            } else {
                                config.timeout = newTimeout;
                            }
                        }

                        // Validate and set edit log events to send from client-provided configuration
                        if('editLogEvents' in message.config) {
                            if(typeof message.config.editLogEvents === 'object') {
                                config.editLogEvents = message.config.editLogEvents;
                            } else {
                                ws.send(JSON.stringify({
                                    status: 'error',
                                    description: 'editLogEvents must be an object'
                                }));
                                return;
                            }
                        }

                        // Validate and set persistence events to send from client-provided configuration
                        if('persistenceEvents' in message.config) {
                            if(typeof message.config.persistenceEvents === 'object') {
                                config.persistenceEvents = message.config.persistenceEvents;
                            } else {
                                ws.send(JSON.stringify({
                                    status: 'error',
                                    description: 'persistenceEvents must be an object'
                                }));
                                return;
                            }
                        }

                        // Bind newly configured events
                        for(var lev of Object.keys(config.editLogEvents)){
                            if(! (lev in subState.editLogEventFunctions)) {
                                var levFunc = sendEvent.bind(null, lev);
                                subState.editLogEventFunctions[lev] = levFunc;
                                state.emitter.on(EVENTS[lev], levFunc);
                            }
                        }

                        // Unbind events that are no longer configured
                        for(var olev of Object.keys(subState.editLogEventFunctions)) {
                            if(! (olev in config.editLogEvents)) {
                                var folev = subState.editLogEventFunctions[olev];
                                state.emitter.removeListener(EVENTS[olev], folev);
                                delete subState.editLogEventFunctions[olev];
                            }
                        }

                        // Bind newly configured persistence events
                        for(var pev of Object.keys(config.persistenceEvents)){
                            if( ! (pev in subState.persistenceEventFunctions)) {
                                var pevFunc = sendEvent.bind(null, pev);
                                subState.persistenceEventFunctions[pev] = pevFunc;
                                state.emitter.on(PERSISTENCE_EVENTS[pev], pevFunc);
                            }
                        }

                        // Unbind persistence events that are no longer configured
                        for(var opev of Object.keys(subState.persistenceEventFunctions)) {
                            if(! (opev in config.editLogEvents)) {
                                var fopev = subState.persistenceEventFunctions[opev];
                                state.emitter.removeListener(PERSISTENCE_EVENTS[opev], fopev);
                                delete subState.persistenceEventFunctions[opev];
                            }
                        }

                        ws.send(JSON.stringify({
                            status: 'success'
                        }));
                        break;
                    default:
                        ws.send(JSON.stringify({ status: 'error', description: 'unsupported message type' }));
                        return;
                }
            });
        });
        state.started = true;
        state.ws = wss;
    }
    stopServer() {
        var state = server.get(this);
        if( ! state.started) {
            throw new Error('WebSocket server not yet started.');
        }
        state.ws.close();
        delete state.ws;
        state.started = false;
    }
}

module.exports = EventServer;
