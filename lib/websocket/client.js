"use strict";
var shared = require('../shared');
var WebSocket = require('ws');

exports.connect = function connect(opts, clientOpts) {
  return new Promise(function (resolve, reject) {
    var backoff = 0, socket, reconnecting, closing;
    var client = shared.createClient(clientOpts);
    client.close = function () { closing = true; if (socket) socket.close(); };
    client.state.on('send', function(msg) { socket.send(JSON.stringify(msg)); });

    (function createSocket() {
      socket = client.state.socket = new WebSocket(opts);
      socket.onmessage = function (msg) {
        client.state.emit('message', msg.data);
      };

      socket.onopen = function () {
        if (closing) return socket.close();
        backoff = 0;
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
      };

      socket.onclose = function () {
        if (closing) client.state.emit('close');
        client.state.connected = false;
        client.state.emit('disconnect');
        if (!closing) reconnect();
      }

	  socket.onerror = function (err) {
		  if (closing) throw err;
		  console.error(err.stack);
		  if (err.code === 'ECONNRESET') return reconnect();
		  if (err.code === 'ETIMEDOUT') return reconnect();
		  if (err.code === 'ECONNREFUSED') return reconnect();
		  throw err;
	  }

	  function reconnect() {
        setTimeout(createSocket, 100 * (backoff * 20));
        backoff = Math.min(backoff + 1, 5);
	  }
    })();
  });
}
