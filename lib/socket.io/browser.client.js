"use strict";
var shared = require('../shared');
var SocketIO = require('socket.io-client');

exports.connect = function connect(opts, clientOpts) {
  return new Promise(function (resolve, reject) {
    var backoff = 0, socket, reconnecting, closing;
    var client = shared.createClient(clientOpts);
    client.close = function () { closing = true; if (socket) socket.close(); };
    client.state.on('send', function(msg) { socket.send(JSON.stringify(msg)); });

    (function createSocket() {
      socket = client.state.socket = SocketIO(opts.uri, Object.assign({}, opts, {
        reconnection: false
      }));
      socket.on('message', function (msg) {
        client.state.emit('message', msg);
      });

      socket.on('connect', function () {
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
      });

      socket.on('disconnect', function () {
        if (closing) client.state.emit('close');
        client.state.connected = false;
        client.state.emit('disconnect');
        if (!closing) reconnect();
      });

	  socket.on('connect_error', function (err) {
      if (!closing) reconnect();
    });
    
	  socket.on('error', function (err) {
		  if (closing) throw err;
		  console.error(err.stack);
		  if (err.code === 'ECONNRESET') return reconnect();
		  if (err.code === 'ETIMEDOUT') return reconnect();
		  if (err.code === 'ECONNREFUSED') return reconnect();
		  throw err;
	  });

	  function reconnect() {
        setTimeout(createSocket, 100 * (backoff * 20));
        backoff = Math.min(backoff + 1, 5);
	  }
    })();
  });
}

