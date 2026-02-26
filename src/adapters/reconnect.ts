import type { AdapterNext, Connection, Peer } from "../psionic";
import type { Session } from "../session";

type ReconnectAdapterOptions = {
    /** Maximum number of reconnection attempts before giving up. Default: Infinity. */
    maxAttempts?: number;
};

type ReconnectAdaptable = {
    session: Session;
    connect: (adapter: () => Promise<Connection>) => Promise<void>;
    handleMessage: (frame: any) => void;
    close: (ex?: any) => void;
    describe: (desc: any) => void;
    local?: any;
};

export function reconnect(inner: () => (peer: AdapterNext) => Promise<Connection>, opts?: ReconnectAdapterOptions): (peer: Peer) => Promise<Connection> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    const maxAttempts = opts?.maxAttempts ?? Infinity;
    return async function connectPeer(peer: ReconnectAdaptable) {
        const newAdapter = inner();
        const connection = await newAdapter({
            session: peer.session,
            close: (ex?: any) => {
                if (!ex) {
                    // allow intentional closes.
                    peer.close();
                    return;
                }
                if (timer) clearTimeout(timer);
                if (attempt >= maxAttempts) {
                    console.warn('Max reconnection attempts reached. Closing peer.');
                    peer.close();
                    return;
                }
                timer = setTimeout(() => {
                    attempt += 1;
                    peer.connect(() => connectPeer(peer)).then(() => { attempt = 0; }).catch(() => {});
                }, Math.min(300 * 2 ** attempt, 30000) + Math.random() * 1000);
            },
            handleMessage: (frame) => {
                return peer.handleMessage(frame);
            }
        });
        attempt = 0;
        queueMicrotask(() => {
            if (!peer.local) return;
            peer.describe(peer.local);
        });
        return connection;
    };
}