import { createPeer } from "psionic";
import OpenAI from "openai";

// listen for incoming socket connections and create a new peer for each one
import { createServer } from "net";
import { createNodeSocketAdapter } from "psionic/adapters/socket";
createServer(socket => handlePeer(createNodeSocketAdapter(socket))).listen(1234);

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
