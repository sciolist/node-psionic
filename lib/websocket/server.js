"use strict";
var shared = require('../shared');
var WebSocketServer = require('ws').Server;

module.exports = function createServer(opts, callback) {
  var server = opts instanceof WebSocketServer ? opts : new WebSocketServer(opts);
  server.on('connection', function(c) { newClient(server, c, callback); });
  return server;
};

function newClient(server, socket, callback) {
  var client = shared.createClient();
  client.state.connected = true;

  client.state.on('send', function (msg) {
    socket.send(JSON.stringify(msg));
  });

  socket.on('message', function (msg) {
    client.state.emit('message', msg);
  });

  socket.on('close', function () {
    client.state.connected = false;
    client.state.emit('disconnect');
  });

  client.state.once('describe', function () {
    callback(client);
    client.state.emit('connect');
  });
}
