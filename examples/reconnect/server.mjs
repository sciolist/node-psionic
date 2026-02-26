import { createPeer } from "psionic";
import { createServer } from "net";
import { createNodeSocketAdapter } from "psionic/adapters/socket";
import { resend } from "psionic/adapters/resend";
import { createSession } from "psionic/session";
const session = createSession();

createServer(socket => handlePeer(resend(createNodeSocketAdapter(socket)))).listen(1234);

let start;
async function handlePeer(adapter) {
    start ??= Date.now();
    console.log(Date.now() - start, 'new peer connecting');
    const peer = createPeer({ description: { slowFunction }, session });
    await peer.connect(adapter);

    setTimeout(() => {
        console.log(Date.now() - start, `closing peer.`);
        peer.close(new Error('simulated connection loss'));
    }, Math.random() * 7000);
}

let id = 0;

async function slowFunction() {
    console.log(Date.now() - start, 'slowFunction called, simulating work...');
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log(Date.now() - start, 'slowFunction returning', (id + 1))
    return 'done: ' + (++id);
}
