"use strict";
var Promise = typeof global.Promise === 'undefined' ? require('es6-promise').Promise : global.Promise;
var EventEmitter = require('eventemitter2');
if (EventEmitter.EventEmitter2) EventEmitter = EventEmitter.EventEmitter2;
var FN_KEYWORD = 'psionic!function';
var slice = Array.prototype.slice;

exports.createClient = function createClient(opts) {
  var client = {}, protectedKeys = null;
  client.events = new EventEmitter();
  client.state = new EventEmitter();
  client.state.setMaxListeners(100);
  client.state.callId = 0;
  client.state.describe = opts ? opts.describe : undefined;
  client.close = function () { client.state.emit('close'); }

  client.state['@describe'] = function parseIncomingDescription(desc) {
    var remoteDescription = deserializeDescription(client, desc || {});
    Object.keys(client).forEach(function (key) {
      if (protectedKeys.indexOf(key) === -1) {
        delete client[key];
      }
    });
    Object.keys(remoteDescription).forEach(function (key) {
      if (protectedKeys.indexOf(key) === -1) {
        client[key] = remoteDescription[key];
      }
    });
    client.state.emit('describe');
  };

  client.state['@emit'] = function () {
    client.events.emit.apply(client.events, arguments);
  };

  client.emit = createRpcInvoker(client, '@emit');

  client.describe = function (value) {
    client.state.describe = value;
    return createRpcInvoker(client, '@describe')(serializeDescription(value));
  };

  client.state.on('open', function () {
    return createRpcInvoker(client, '@describe', false)(serializeDescription(client.state.describe));
  });

  client.state.on('message', function(msg) { onMessage(client, msg); });
  protectedKeys = Object.keys(client);
  client.state['@describe']();
  return client;
};

function serializeDescription(description) {
  if (!description) return;
  return JSON.parse(JSON.stringify(description, function (key, value) {
    if (value instanceof Function) return FN_KEYWORD;
    return value;
  }));
};

function deserializeDescription(client, description) {
  return (function createInvokers(obj, prefix) {
    Object.keys(obj).forEach(function (key) {
      if (obj[key] === FN_KEYWORD) {
        obj[key] = createRpcInvoker(client, prefix + key);
      } else if (typeof obj[key] === 'object') {
        createInvokers(obj[key], prefix + key + '.');
      }
    });
    return obj;
  })(description, '');
};

function createRpcInvoker(client, name, awaits) {
  function awaitConnection() {
    if (awaits === false) return Promise.resolve(true);
    if (client.state.connected) return Promise.resolve(true);
    else return new Promise(function (resolve) { client.state.once('connect', resolve); });
  }

  return function rpc() {
    var id, args, json;
    try {
      id = client.state.callId = (client.state.callId + 1) % (-(1<<31));
      args = Array.prototype.slice.call(arguments);
      json = { id: id, name: name, args: args };
    } catch(ex) { return Promise.reject(ex); }

    return awaitConnection().then(function () {
      return new Promise(function (resolve, reject) {
        client.state.once('disconnect', onClose);
        client.state.once('result:' + id, onResult);
        client.state.emit('send', json);
        function onResult(data) {
          client.state.removeListener('disconnect', onClose);
          if (!data.error) return resolve(data.result);
          var error = new Error('when calling ' + name + ': ' + data.error.message);
          error.code = data.error.code;
          reject(error);
        }
        function onClose() {
          client.state.removeListener('result:' + id, onResult);
          reject(new Error('connection disconnect'));
        }
      });
    });
  }
};

function onMessage(client, msg) {
  var data = null;
  try {
    data = JSON.parse(msg.substring ? msg : msg.data);
  } catch (ex) {
    let error = 'could not parse request: ' + msg;
    client.state.emit('send', { error: { code: -32700, message: error } });
    return;
  }

  if (!('name' in data)) {
    client.state.emit('result:' + data.id, data);
  } else {
    wrapInvocation(data.name, data.args)
    .then(function (result) {
      client.state.emit('send', { id: data.id, result: result });
    }, function (ex) {
      if (ex.code !== -32601) {
        console.error(ex.stack || ex);
      }
      client.state.emit('send', { id: data.id, error: { code: ex.code || -32000, message: ex.friendlyMessage || 'Unhandled error' } });
    });
  }

  function wrapInvocation(name, args) {
    return new Promise(function (resolve, reject) {
      var target = null
      if (name[0] === '@' && client.state[name]) {
        target = client.state[name];
      } else {
        var parts = (name || '').split('.');
        var target = client.state.describe || {};
        for (var i=0; target && i<parts.length; ++i) {
          target = target[parts[i]];
        }
      }
      if (!(target instanceof Function)) {
        var error = new Error('Function not found: ' + name);
        error.friendlyMessage = error.message;
        error.code = -32601;
        reject(error);
      } else {
        try { resolve(target.apply(client, args)); }
        catch (ex) { reject(ex); }
      }
    });
  };
}
