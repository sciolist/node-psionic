"use strict";
var shared = require('../shared');
var net = require('net');
var carrier = require('carrier');

module.exports = function connect(opts, clientOpts) {
  if (opts === undefined) opts = {};
  return new Promise(function (resolve, reject) {
    var backoff = 0, reconnecting, closing, socket;
    var client = shared.createClient(clientOpts);
    client.close = function () { closing = true; if (socket) socket.destroy(); };
    client.state.on('send', function(msg) { socket.write(JSON.stringify(msg) + '\n'); });

    (function createSocket() {
      socket = client.state.socket = net.connect(opts, function (err) {
        if (err || closing) return reconnect(err);
        backoff = 0;
        socket.on('close', reconnect);
        carrier.carry(socket, function (line) {
          client.state.emit('message', line);
        });
        client.state.emit('open');
        client.state.once('describe', function() {
          client.state.connected = true;
          Promise.resolve(opts.connect instanceof Function ? opts.connect(client, reconnecting) : null)
            .then(function () {
              client.state.emit('connect');
              resolve(client);
            });
          reconnecting = true;
        });
      });
      socket.on('error', reconnect);

      function reconnect(ex) {
        if (closing) client.state.emit('close');
        if (!reconnecting || closing) return reject(ex);
        console.error(ex.stack);
        if (client.state.connected) client.state.emit('disconnect');
        client.state.connected = false;
        setTimeout(createSocket, 100 * (backoff * 20));
        backoff = Math.min(backoff + 1, 5);
      }
    })();
  });
}
