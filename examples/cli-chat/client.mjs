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
