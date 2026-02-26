import { createPeer } from "psionic";

const peer = createPeer({
    description: {},
    // this allows us to receive error details from the server, otherwise all errors are generic.
    receiveErrorMessages: true
});

// connect to the local websocket
import { createWebSocketAdapter } from "psionic/adapters/websocket";
await peer.connect(createWebSocketAdapter(new WebSocket('ws://localhost:1234')));

while (peer.remote.dowork && peer.ready) {
    console.log('Starting work...');
    try {
        const result = await peer.remote.dowork();

        console.log(`Work result: ${result}`);
        console.log(`Tokens remaining: ${peer.remote.tokens}`);
    } catch(ex) {
        console.log('Something went wrong while working:', ex.message);
    }
}

console.log('Done!');
peer.close();