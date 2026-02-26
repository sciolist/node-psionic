# Cloudflare + Psionic Example

This example shows a simple Svelte chat application that runs in a Cloudflare Durable Object.

To run it, you'll need to fill in an OpenAI key in the `.env` file, like:

```
OPENAI_API_KEY=sk-...
```

Then you can run the development server with:

```
npm install
npm run dev
```

To publish it to your own Cloudflare account run:

```
npx wrangler secret put OPENAI_API_KEY
npm run deploy
```

## Structure

### Frontend

`src/api.ts` connects to the Cloudflare worker and sets up the Psionic peer.

`src/App.svelte` is the main Svelte component, which uses the peer to send messages and receive responses.

### Backend

`worker/cloudflare.ts` configures the Cloudflare Durable Object and sets up the Psionic peer, if the peer disconnects for 15 seconds the session is removed from the DO.

`worker/peer.ts` contains the logic for handling incoming messages, generating responses using the OpenAI API, and sending them back to the client.
