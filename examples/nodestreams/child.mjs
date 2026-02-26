import { createStreamAdapter } from "./adapter.mjs";
import { createPeer } from "psionic";

process.stdin.on('data', data => { process.stderr.write('< ' + data.toString()); });

async function* streamwork(count) {
    try {
        for (let i = 0; i < count; i++) {
            await new Promise(resolve => setTimeout(resolve, Math.random() * 4_000));
            yield Math.floor(Math.random() * 100);
            await peer.describe(d => ({ ...d, progress: i / count }));
        }
    } finally {
        console.error('child stream closed.');
        await peer.describe({});
    }
}

const peer = createPeer({ description: { streamwork } });
await peer.connect(createStreamAdapter(process.stdin, process.stdout));
