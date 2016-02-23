"use strict";
var shared = require('../shared');
var SocketIO = require('socket.io');

exports.createServer = function createServer(opts, callback) {
  var server = opts instanceof SocketIO ? opts : SocketIO(opts);
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
		  console.error(ex.stack || ex);
		  server.emit('error', ex);
	  });
	}	
    client.state.emit('connect');
  });
}

