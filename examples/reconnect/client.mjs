import { createPeer } from "psionic";
import { createNodeSocketAdapter } from "psionic/adapters/socket";
import { connect } from "net";
import { reconnect } from "psionic/adapters/reconnect";
import { resend } from "psionic/adapters/resend";
import { createSession } from "psionic/session";

const session = createSession();
const peer = createPeer({ description: {}, session });

await peer.connect(reconnect(() => resend(createNodeSocketAdapter(connect({ port: 1234 })))));

let start = Date.now();
while (true) {
    try {
        console.log(Date.now() - start,'calling slowFunction...');
        const out = await peer.remote.slowFunction();
        console.log(Date.now() - start,'slowFunction: ' + out);
    } catch(ex) {
        console.log('slowFunction call failed:', ex.message);
    }
}
