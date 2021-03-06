"use strict";
var shared = require('../shared');
var WebSocketServer = require('ws').Server;

exports.createServer = function createServer(opts, callback) {
  var server = opts instanceof WebSocketServer ? opts : new WebSocketServer(opts);
  server.on('connection', function(c) { newClient(server, c, callback); });
  return server;
};

function newClient(server, socket, callback) {
  var client = shared.createClient();
  client.state.connected = true;
  client.state.socket = socket;

  client.state.on('send', function (msg) {
    try {
      socket.send(JSON.stringify(msg));
    } catch(ex) { client.state.emit('error', ex); }
  });

  socket.on('message', function (msg) {
    client.state.emit('message', msg);
  });

  socket.on('close', function () {
    client.state.connected = false;
    client.state.emit('disconnect');
  });

  client.state.once('describe', function () {
    var promise = callback(client);
	if (promise && promise.then) {
	  promise.then(function() {}, function(ex) {
		  console.error(ex.stack);
		  server.emit('error', ex);
	  });
	}	
    client.state.emit('connect');
  });
}
