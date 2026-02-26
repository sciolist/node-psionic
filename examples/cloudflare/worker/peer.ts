import type { Peer } from "psionic";
import type { ClientAPI } from "../src/api";
import OpenAI from "openai";


export type CFWorkerAPI = {
    /** The session ID of the current peer */
    sid?: string;
    /** The ID of the current conversation */
    conversation_id?: string | null;
    /** A function to send a prompt to the AI model */
    prompt: (input: string) => AsyncGenerator<OpenAI.Responses.ResponseStreamEvent>;
};

export type PeerType = Peer<ClientAPI, CFWorkerAPI>;

export async function handlePeer(sid: string, peer: PeerType) {
    const openAI = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // send a list of functions and properties to the client.
    // they can access this under peer.remote from their end, and we can update it at any time.
    await peer.describe(desc => ({ ...desc, sid, prompt }));

    // this is a function that can be called by the client.
    // it returns an async generator, which allows us to stream data back to the client in chunks.
    async function* prompt(input: string) {
        const conversation_id = peer.local?.conversation_id
        const data = await openAI.responses.create({
            // peer.remote is a live-updating view of the client's described state.
            model: 'gpt-5.2',
            store: true,
            stream: true,
            previous_response_id: conversation_id,
            tools: [{ type: "web_search" }],
            input: String(input || 'Hello, world!'),
        });
        for await (const part of data) {
            console.log(part.type, part.sequence_number);
            if (part.type === 'response.completed') {
                await peer.describe(desc => ({ ...desc, conversation_id: part.response.id }));
            }
            // yield one chunk to the client at a time
            // this waits until they ask for the next one before continuing.
            yield part;
        }
    }
}
