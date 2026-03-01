import type { WireCodec, Frame, Connection, AdapterNext } from "../psionic";
import { psionicCodec } from "../codecs/psionic";

export type WebSocketAdapterOptions = {
    /** Optional codec to use for encoding/decoding messages. */
    codec?: WireCodec;
    /** Max frame size in bytes. Default: 1MB. */
    maxFrameSize?: number;
    /** Interval in milliseconds for sending ping messages. Default: 10000 (10 seconds). */
    pingInterval?: number;
};

export type AdaptableWebSocket = {
    readyState: number;
    addEventListener: (type: any, listener: (event: any) => void) => void;
    removeEventListener: (type: any, listener: (event: any) => void) => void;
    send: (message: string | ArrayBufferView | Blob | ArrayBufferLike) => void;
    close: (code?: number, reason?: string) => void;
};

const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

const pingText = new Uint8Array([112, 105, 110, 103]); // "ping";
const pongText = new Uint8Array([112, 111, 110, 103]); // "pong";

/** Adapter for browser and standards-compatible WebSockets. */
export function createWebSocketAdapter(socket: AdaptableWebSocket, opts?: WebSocketAdapterOptions): (peer: AdapterNext) => Promise<Connection> {
    const pingInterval = opts?.pingInterval ?? 10000;
    return async function connectPeer(peer: AdapterNext) {
        let latestMessage = Date.now();
        const codec = opts?.codec ?? psionicCodec();
        const maxFrameSize = opts?.maxFrameSize ?? (1 * 1_048_576);

        let dead = false;

        if (socket.readyState === CLOSING || socket.readyState === CLOSED) {
            throw new Error('WebSocket is already closed or closing');
        }

        socket.addEventListener('close', onClose);

        let pingTimer: ReturnType<typeof setInterval> | undefined = undefined;
        function startPing() {
            if (pingTimer) {
                clearInterval(pingTimer);
                pingTimer = undefined;
            }
            if (!dead) {
                pingTimer = setInterval(onPingTimer, pingInterval);
            }
        }

        function onPingTimer() {
            if (dead) {
                clearInterval(pingTimer!);
                return;
            }
            const elapsed = Date.now() - latestMessage;
            if (elapsed < pingInterval) return; // no need, we heard from them recently
            if (elapsed > pingInterval * 2) {
                clearInterval(pingTimer!);
                onError(new Error('No response to ping, assuming connection is dead'));
                return;
            }
            try {
                socket.send(pingText);
            } catch (ex) {
                onError(ex instanceof Error ? ex : new Error(String(ex)));
            }
        }

        function onMessage(message: MessageEvent) {
            latestMessage = Date.now();
            if (message.data instanceof Uint8Array && message.data.every((v, i) => v === pongText[i])) return; // Ignore pong responses
            if (message.data instanceof Uint8Array && message.data.every((v, i) => v === pingText[i])) { socket.send(pongText); return; } // Respond to pings
            const msg = getMessageBytes(message);
            if (msg.byteLength > maxFrameSize) {
                onError(new Error('Frame size exceeds maximum allowed'));
                return;
            }
            try {
                const messageData = codec.messageFromWire(msg);
                peer.handleMessage(messageData);
            } catch (ex) {
                onError(ex instanceof Error ? ex : new Error(String(ex)));
            }
        }

        function onSend(message: Frame) {
            if (dead) return;
            try {
                const messageData = codec.messageToWire(message);
                socket.send(messageData);
            } catch (ex) {
                onError(ex instanceof Error ? ex : new Error(String(ex)));
                throw ex;
            }
        }

        function onError(error: Error) {
            if (dead) return;
            onClose(error);
        }

        function onClose(error?: any) {
            if (dead) return;
            dead = true;
            clearInterval(pingTimer!);
            socket.removeEventListener('message', onMessage);
            socket.removeEventListener('close', onClose);
            if (socket.readyState === OPEN || socket.readyState === CONNECTING) {
                socket.close(error instanceof Error ? 3000 : 1000, error instanceof Error ? error.message : 'Normal Closure');
            }
            peer.close(error);
        }

        async function waitUntilOpen() {
            if (socket.readyState === OPEN) return;
            await new Promise((resolve, reject) => {
                if (dead) return closer();
                socket.addEventListener('open', opener);
                socket.addEventListener('close', closer);
                function opener() {
                    socket.removeEventListener('open', opener);
                    socket.removeEventListener('close', closer);
                    resolve(undefined);
                }
                function closer() {
                    socket.removeEventListener('open', opener);
                    socket.removeEventListener('close', closer);
                    reject(new Error('WebSocket closed before connection could be established'));
                }
            });
        }

        await waitUntilOpen();
        startPing();
        socket.addEventListener('message', onMessage);
        return {
            send: onSend,
            close: onClose
        };
    }
}

function getMessageBytes(message: MessageEvent): Uint8Array {
    if (typeof message.data === 'string') return new TextEncoder().encode(message.data);
    if (message.data instanceof ArrayBuffer) return new Uint8Array(message.data);
    if (message.data instanceof Uint8Array) return message.data;
    // no support for blobs, too much async overhead for something that can be easily handled at the application level if needed
    throw new Error('Unsupported message data type');
}
