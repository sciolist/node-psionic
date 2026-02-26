# Psionic

```bash
bun add psionic # or npm install psionic
```

Psionic is a lightweight bidirectional communication protocol designed for dynamic APIs and streaming data.

Each connection consists of two symmetrical peers. Either side may expose functions, invoke calls, and stream data from the other end.

## Quick start - Streaming RPC data

We'll start with a simple streaming chat example using the OpenAI API.

```bash
mkdir cli-chat && cd cli-chat
bun init -y
bun add openai psionic
```

#### server.mjs
```javascript
import { createPeer } from "psionic";
import OpenAI from "openai";

// listen for incoming socket connections and create a new peer for each one
import { createServer } from "net";
import { createNodeSocketAdapter } from "psionic/adapters/socket";
import { createSession } from "../../src/session";
createServer(socket => handlePeer(createNodeSocketAdapter(socket, { session: createSession() }))).listen(1234);

// global conversation_id for demo purposes.
let conversation_id = undefined;

async function handlePeer(adapter) {
    const peer = createPeer();
    await peer.connect(adapter);

    const openAI = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    // send a list of functions and properties to the client.
    // they can access this under peer.remote from their end, and we can update it at any time.
    await peer.describe(desc => ({ ...desc, prompt }));

    // this is a function that can be called by the client.
    // it returns an async generator, which allows us to stream data back to the client in chunks.
    async function* prompt(input) {
        try {
            const data = await openAI.responses.create({
                // peer.remote is a live-updating view of the client's described state.
                model: peer.remote?.model || 'gpt-5.2',
                store: true,
                stream: true,
                previous_response_id: conversation_id,
                tools: [{ type: "web_search" }],
                instructions: `Send really terse responses.`,
                input: String(input)
            });
            for await (const part of data) {
                console.log(part.type, part.sequence_number);
                if (part.type === 'response.completed')
                    conversation_id = part.response.id;
                // yield one chunk to the client at a time
                // this waits until they ask for the next one before continuing.
                yield part;
            }
        } finally {
            // this will run if the peer disconnects, times out, or if the function completes!
            console.log('prompt ended!');
        }
    }
}
```

#### client.mjs
```javascript

import { createPeer } from "psionic";

// create a peer, with the description we want to send when we connect.
// could be anything, in this case, just the model we want the server to use.
const peer = createPeer({ description: { model: process.argv[3] || 'gpt-5.2' } });

// connect to the local socket
import { createConnection } from "net";
import { createNodeSocketAdapter } from "psionic/adapters/socket";
await peer.connect(createNodeSocketAdapter(createConnection({ port: 1234 })));

// pass the argument from the command line to the server's prompt function
for await (const chunk of peer.remote.prompt(process.argv[2])) {
    // and stream the response back to the console as it comes in!
    if (chunk.type === 'response.output_text.delta')
        process.stdout.write(String(chunk.delta));
}

// close the connection so that the process exits
peer.close();
console.log('');
```

Then start the server and client in separate terminal windows:
```bash
bun server.mjs
```

```bash
bun client.mjs "How many people live in New York City?" "gpt-5.1"
# New York City has roughly **8.5–8.8 million** residents.

bun client.mjs "When was it founded?"
# Founded in 1624 as New Amsterdam by the Dutch West India Company; it was renamed New York in 1664 after the English seized the colony.
```

The server will stream the response from OpenAI to the client, which will print it to the console as it arrives.

You can abort the response at any time by pressing Ctrl-C in the client terminal, which will also trigger cleanup on the server.

## Why Psionic Exists

Most RPC systems assume relatively static APIs and short-lived request/response interactions.

Psionic was designed for environments where APIs are inherently dynamic, where functions and permissions can change at any point during runtime. Instead of treating an API as a fixed contract, Psionic models it as a live capability graph that peers synchronize with each other.

## Bundle size

Psionic has no dependencies. Total size depends on which modules you include:

```
psionic                  9.93 kB │ gzip:  3.73 kB
adapters/socket          2.61 kB │ gzip:  1.17 kB
adapters/websocket       1.61 kB │ gzip:  0.74 kB
adapters/webworker       1.09 kB │ gzip:  0.48 kB
codecs/default           1.24 kB │ gzip:  0.68 kB
codecs/cbor              3.26 kB │ gzip:  1.41 kB
session                 0.83 kB │ gzip:  0.51 kB
```

## Dynamic capabilities and Error handling

The remote state can be changed at any time by calling `peer.describe()`, this example uses dynamic descriptions to limit the amount of work a single peer can do.

#### server.mjs
```javascript
import { createPeer } from "psionic";
import { WebSocketServer } from "ws";
import { createWebSocketAdapter } from "psionic/adapters/websocket";
const wss = new WebSocketServer({ port: 1234 });
wss.on('connection', socket => handlePeer(createWebSocketAdapter(socket)));

async function handlePeer(adapter) {
    let tokens = 5;
    const peer = createPeer({
        description: describe(),
        // if this is not true, any errors will have their text replaced by a generic message.
        sendErrorMessages: true
    });
    await peer.connect(adapter);
    peer.on('error', ex => {
        console.log('Something went wrong:', ex.message);
    });

    async function dowork() {
        await new Promise(r => setTimeout(r, Math.random() * 4_000));

        const workResult = Math.random();

        if (workResult > 0.5) {
            // this will propagate as a remote error to the client.
            throw new Error('Work failed!');
        }

        tokens -= 1;

        // Send a new description to the client, which will cause their peer.remote to update.
        await peer.describe(describe);

        return workResult;
    }

    function describe() {
        return {
            tokens,
            // dowork can only be called if we have tokens.
            // so if we don't, we don't even include it, making it uncallable.
            dowork: tokens > 0 ? dowork : undefined
        };
    }
}
```

#### client.mjs
```javascript
import { createPeer } from "psionic";

const peer = createPeer({
    description: {},
    // this allows us to receive error details from the server, otherwise all errors are generic.
    receiveErrorMessages: true
});

// connect to the local websocket
import { createWebSocketAdapter } from "psionic/adapters/websocket";
await peer.connect(createWebSocketAdapter(new WebSocket('ws://localhost:1234')));

while (peer.remote.dowork) {
    try {
        const result = await peer.remote.dowork();

        console.log(`Work result: ${result}`);
        console.log(`Tokens remaining: ${peer.remote.tokens}`);
    } catch(ex) {
        console.log('Something went wrong while working:', ex.message);
    }
}

console.log('No more tokens!');
peer.close();
``` 

## Key Concepts

### Peer

A `Peer` represents one side of a Psionic connection.

Peers are symmetrical: either side may describe state, expose functions, invoke remote functions, or stream data.
There is no client/server distinction at the protocol level.

### Description

A `Description` represents the capability surface exposed by a `Peer`.

It defines which functions and properties are available to the remote `Peer`. Only values present in the `Description` may be accessed or invoked remotely.

Descriptions may be updated at runtime. Removing a function from a description immediately revokes the remote peer’s ability to invoke it.

```javascript
peer.describe(newState) // swap the entire state with a new description object
peer.describe(current => ({ ...current, ...changes })) // apply a partial update to the state
```

A description update is transactional. The call completes only after the remote peer acknowledges the new capability state, but the state is immediately updated on the local peer. If the call cannot complete for any reason, the connection is closed to prevent desynchronization.

When using the function form, only the structural differences are sent, if any. This allows you to keep a larger description up-to-date with less overhead.

Descriptions define the authority boundary of a peer.
A peer may only access or invoke values explicitly described by the remote side.

This simplifies reasoning about security and capabilities in a dynamic system.

### Adapter

An `Adapter` binds a `Peer` to a transport layer.

Adapters are transport-agnostic and may be implemented for any bidirectional communication channel.

There are built-in adapters for node.js sockets, web sockets and web workers, but you can implement your own for any transport that supports bidirectional communication.

The adapter is responsible for:

- Delivering frames between peers
- Managing connection lifecycle
- Providing an `Session` for operation lifecycle management

The `Session` manages pending calls, generators, and cleanup semantics.

## Events

Peers emit events for connection lifecycle and state changes, most applications will use `ready` and `describe` events to manage connection state and react to description updates, and `error` to catch unhandled exceptions.

- **`connect`** - Transport connection established.

- **`ready`** -  Both peers have exchanged descriptions and remote capabilities are available.

- **`disconnect`** - Transport connection lost.

- **`describe`** - Remote description has been updated.

- **`send`** - A frame is being sent to the remote peer.

- **`message`** - A frame has been received from the remote peer.

- **`error`** - An unhandled error was thrown during operation.

The events can be registered and unregistered:

```javascript
const unsubscribe = peer.on('error', logErrorToMonitoringService);
peer.off('error', logErrorToMonitoringService);
unsubscribe(); // alternative way to unregister the listener
```

There is a utility for subscribing to the `describe` events 


## Call context

In some situations you may need to find the ID of the current RPC call, for tracing for example. There is a wrapping function that adds a context object to the start of the arguments list, which contains this information. You can access it like this:

```javascript
import { withContext } from "psionic";

function myFunction(context, arg1, arg2) {
    console.log(context.id); // the id that the peer sent to start the call.
    console.log(context.operation.id); // the id of the operation operation associated with this call.
}

peer.describe(desc => ({ ...desc, myFunction: withContext(myFunction) }));
```

## Notable Users (let me know if you're using Psionic for something fun!)

- **Koenigsegg** - Psionic is used for remote telemetry, OTA updates, and mobile application control of their hypercars in the wild. That's where it was built!

- **FallenTrees** - Psionic is used to power dynamic AI analysis plugin system for real-time satellite data analysis and forecasting.

- **Bergans of Norway** - Psionic powers analysis and visualization of AI-generated insights from Bergans' extensive purchase history and user behavior data, giving insights into trends and preferences to inform inventory and marketing decisions.

## "Examples & Documentation

There are examples in the `examples` folder:

- [Cloudflare Pages / Workers Example](./examples/cloudflare)
- [Node.js Child process streams](./examples/nodestreams)
- [OpenAI chat](./examples/cli-chat)
- [Work tokens example](./examples/tokens)

And further documentation is in the `docs` folder:

- [Protocol documentation](./docs/protocol.md)
- [Extending Psionic](./docs/extending.md)
