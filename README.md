# psionic rpc

not stable.

psionic is a bidirectional rpc system for node, glued together with json-rpc and a promise-based workflow.

## getting started

to create a websocket-server (using [ws](https://github.com/websockets/ws)):

``` js
// server
// note: using babel is optional, but more fun.
import psionic from 'psionic';

psionic.webSocket.createServer({ port: 3000 }, function (client) {
  // you have to call 'describe' once for the client to start.
  client.describe({
    factor: 'doubling'
    // functions can return promises if needed,
    // they'll always be promises for the caller.
    multiply(x) { return x * 2; }
  });
});
```

and a corresponding client:

``` js
// client
import psionic from 'psionic';

(async function () {
  let client = await psionic.webSocket.connect('ws://localhost:3000');
  let doubled = await client.multiply(5);
  console.log(client.factor + '5 gives ' + doubled + '! amazing!');
  // doubling 5 gives 10! amazing!
})().catch(ex => console.error(ex.stack));
```

## server to client communication

the client can also call describe to send state to the server.

``` js
// client
import psionic from 'psionic';

(async function () {
  let client = await psionic.webSocket.connect('ws://localhost:3000', {
    // using connect options, your state will be sent right as the server socket is created.
    describe: { name: "joe" }
  });

  let result = await client.test("jdp");
  if (!result) {
    // you can also call describe later to send state whenever needed,
    // which gives a promise to be sure it makes it to the server.
    await client.describe({
      name: "jdp",
      welcome(x) { console.log('Server says: ' + x); }
    });
  }

  console.log(await client.test("jdp"));
})().catch(ex => console.error(ex.stack));
```

corresponding server:

``` js
// server
import psionic from 'psionic';

psionic.webSocket.createServer({ port: 3000 }, function (client) {
  // the 'client' objects data is sent from the client,
  // it is user input and can't be trusted.
  let name = client.name; // joe

  client.describe({
    async test(testName) {
      if (client.welcome instanceof Function) {
        await client.welcome('Welcome, ' + client.name);
      }
      return testName === client.name;
    }
  });
});
```

## emitting events

if you need ad-hoc message passing, you can use the event emitter:

``` js
// server
// note: using babel is optional, but more fun.
import psionic from 'psionic';

psionic.webSocket.createServer({ port: 3000 }, function (client) {
  client.describe({}); // describe still has to be called.
  var pings = 0;
  
  client.events.on('pong', function (i) {
    console.log('client sent a pong: ' + i);
  });
  
  setInterval(function () {
    client.emit('ping', ++pings);
  }, 1000);
});
```

and a corresponding client:

``` js
// client
import psionic from 'psionic';

(async function () {
  let client = await psionic.webSocket.connect('ws://localhost:3000');
  
  client.events.on('ping', function (i) {
    console.log(i + ' pings since we connected');
    // the client can trigger events on the server, as well.
    client.emit('pong', i);
  });
})().catch(ex => console.error(ex.stack));
```

# communication protocols

So far there is no implementation with fallbacks (using say, socket.io or primus,) so each server/client pair is specific to a single protocol.

## socket

Plain [Node.js net sockets](https://nodejs.org/api/net.html#net_net_createserver_options_connectionlistener).

It can be accessed using `require('psionic').socket`, or `require('psionic/lib/socket')`

``` js
// server
import psionic from 'psionic';

// all server options are passed to net.createServer
// if a `port` is passed, net.listen will be called during construction.
var opts = { port: 9000 };

var server = psionic.socket.createServer(opts, function (client) { });

// createServer returns the underlying net server
server.listen(9000);

// client
var promise = psionic.socket.connect(
	// the first argument is passed to net.connect
	{ port: 9000 },
    
    // the second argument is used to configure the psionic client.
    { describe: {} } 
);

promise.then(function (client) {
	// you can get the underlying socket after connecting.
    // note that the client auto-reconnects, so this can change.
	var underlyingSocket = client.state.socket;
});
```

## websocket

Websockets are created using the [websockets/ws](https://github.com/websockets/ws) library, or natively on the browser.

It can be accessed using `require('psionic').webSocket`, or `require('psionic/lib/websocket')`

``` js
// server
import psionic from 'psionic';

// all server options are passed to the ws.Server constructor
var opts = { port: 9000 };

var server = psionic.webSocket.createServer(opts, function (client) { });

// createServer returns the underlying ws server
server.listen(9000);

// client
var promise = psionic.webSocket.connect(
	// the first argument is passed to the ws WebSocket constructor
    'ws://127.0.0.1:9000',
    
    // the second argument is used to configure the psionic client.
    { describe: {} } 
);

promise.then(function (client) {
	// you can get the underlying WebSocket after connecting.
    // note that the client auto-reconnects, so this can change.
	var underlyingSocket = client.state.socket;
});
```

### browser support

The WebSocket protocol does not use any polyfills at this time, so it's limited to IE10+. If that's not a problem, you can `require('psionic')` with browserify or webpack and use `psionic.webSocket.connect`. 


# client object

The client object is used on both the server- and client-side to send and receive messages.

``` js
// Default client structure
client = {
  events: EventEmitter,
  state: EventEmitter + {
    connected: true,
    
    // callId stores the id of the previous rpc-call,
    // this is incremented for every call.
    callId: 0,
    
    // describe is a reference to the functions that
    // can be called from the remote. it is replaced
    // by calling `client.describe`.
    describe: { ... },
    
    // @emit is called when the remote triggers an event.
    "@emit": Function
    
    // @describe is called when the remote is replacing its description.
    "@describe": Function
  },
  
  // the describe function calls @describe on the remote,
  // to tell it which functions are available on this client.
  describe: Function,
  
  // emit calls @emit on the remote, which triggers an event.
  emit: Function
  
  // any other functions that are added using the describe function
  // on the remote are found on this object as well.
}
```

### client.state events

Client.state has a few events that can be used to detect changes in the connection.

- `open` - connected, but no service description has been receieved
- `describe` - an updated service description has been received
- `connect` - connected, and a service description has been received
- `send` - a message is ready to be sent to the remote
- `message` - a message has been received from the remote
- `result:{id}` - a remote procedure call has returned a value
- `disconnect` - the transport has disconnect, but might reconnect
- `close` - the transport is shutting down, and will not reconnect

### client.events events

Client.events is only triggered by calling `Client.emit(name, args)`, and can have any event names.

### creation options

When connecting to a server using `socket.connect` or `webSocket.connect`,
you can supply options (well, option..) to configure the client.

- `describe` - state object that is sent to the server when connecting, can be used to pass state needed for initializing the remote service.

# messaging protocol

Psionic uses [JSON-RPC](http://json-rpc.org/wiki/specification) messages, with single line JSON. It does not support notification requests at this time, all requests must be responded to.

#### example messages

In order to begin communicating, both client and server must send their description.
The client starts this, by calling the "@describe" function.

<div style="font-size:10px;margin-bottom:-8px;height:10px;">(client to server)</div>

```json
{"id":1,"name":"@describe","args":[{"test":"psionic!function","example":"value"}]}
````

This tells the server to create an rpc-function called "test", and an extra value to add to the `client` object. The object can be arbitrarily nested.. When the server is ready, it responds to the message and sends its own description.

<div style="font-size:10px;margin-bottom:-8px;height:10px;">(server to client)</div>

```json
{"id":1}
{"id":5,"name":"@describe","args":[{"login":"psionic!function"}]}
```

The client then responds to the message, and calls its login function.

<div style="font-size:10px;margin-bottom:-8px;height:10px;">(client to server)</div>

```json
{"id":5}
{"id":2,"name":"logim","args":["username","password"]}
```

After the server is done processing the request, it will respond with its result:

<div style="font-size:10px;margin-bottom:-8px;height:10px;">(server to client)</div>

```json
{"id":2,"error":{"code":-32601,"message":"Function not found: logim"}}
```

Different error codes are sent based on the JSON-RPC spec. `code` and `friendlyMessage` are used from any thrown Error objects. If no friendlyMessage is found, "Unhandled error" will be used. Let's try that again..

<div style="font-size:10px;margin-bottom:-8px;height:10px;">(client to server)</div>

```json
{"id":3,"name":"login","args":["username","password"]}
```

There we go, everything's spelled right, now we'll get a response:

<div style="font-size:10px;margin-bottom:-8px;height:10px;">(server to client)</div>

```json
{"id":3,"result":true}
```

And that's it!

