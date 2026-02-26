import { createPeer, STATE_READY } from 'psionic';
import { writable } from 'svelte/store';
import { createWebSocketAdapter } from 'psionic/adapters/websocket';
import { reconnect } from 'psionic/adapters/reconnect';
import { type CFWorkerAPI } from '../worker/peer'

export type ClientAPI = { };


const peer = createPeer<CFWorkerAPI, ClientAPI>({
    description: {},
    receiveErrorMessages: true
});

// Attempt to reuse existing session ID from previous connection, if available.
let sid = sessionStorage.getItem('sid') ?? undefined;

peer.on('describe', d => {
    // update sid from the server if it sends one, and persist for next time.
    if (d.sid && d.sid !== sid) {
        sid = d.sid;
        sessionStorage.setItem('sid', sid);
    }
});

export const server = writable<Partial<CFWorkerAPI>>({});

export const ready = writable(false);
peer.on('readyStateChange', (s) => { ready.set(s === STATE_READY); });
peer.on('describe', d => server.set(d));

// setup a reconnecting websocket adapter to the Durable Object, which will maintain session state across disconnects.
peer.connect(reconnect(() => createWebSocketAdapter(new WebSocket('/websocket?sid=' + (sid || '')))));
