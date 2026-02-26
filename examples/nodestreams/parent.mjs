import { createStreamAdapter } from "./adapter.mjs";
import { createPeer } from "psionic";
import { spawn } from 'child_process';

const proc = spawn(process.argv[0], ['child.mjs'], {
    stdio: ['pipe', 'pipe', 'inherit']
});

proc.stdout.on('data', data => { process.stderr.write('> ' + data.toString()); });

const peer = createPeer({ description: {} });
await peer.connect(createStreamAdapter(proc.stdout, proc.stdin));

while (peer.remote.streamwork) {
    for await (const work of peer.remote.streamwork(20)) {
        console.log('got stream result from child process:', work);
    }
}

proc.kill();
