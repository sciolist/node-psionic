"use strict";
var shared = require('../shared');
var net = require('net');
var carrier = require('carrier');

module.exports = function createServer(opts, callback) {
  if (arguments.length === 1) {
	  return net.createServer(function (c) {
		newClient(server, c, callback);
	  });
  } else {
	  var server = net.createServer(opts, function (c) {
		newClient(server, c, callback);
	  });
	  if (opts.port) server.listen(opts.port);
	  return server;
  }
};

function newClient(server, socket, callback) {
  var client = shared.createClient();
  client.state.connected = true;
  client.state.socket = socket;

  client.state.on('send', function (msg) {
    try {
      socket.write(JSON.stringify(msg) + '\n');
    } catch(ex) { client.state.emit('error', ex); }
  });

  carrier.carry(socket, function (line) {
    client.state.emit('message', line);
  });

  socket.on('close', function (reason) {
    client.state.connected = false;
    client.state.emit('disconnect', reason);
    client.state.emit('close', reason);
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
