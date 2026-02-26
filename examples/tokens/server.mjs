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
        console.log('Unhandled error:', ex.message);
    });

    async function dowork() {
        await new Promise(r => setTimeout(r, Math.random() * 4_000));

        const workResult = Math.random();

        if (workResult > 0.5) {
            // this will propagate as a remote error to the client.
            throw new Error('Work failed!');
        }

        tokens -= 1;
        console.log('Work done, tokens left:', tokens);

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