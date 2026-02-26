import type { Frame, Adapter, AdapterNext } from "../psionic";
import { psionicCodec } from "../codecs/psionic";

const codec = psionicCodec({ maxEntities: 0xFFFFFFFFFFFF });

export type WorkerAdapterOptions = {
};

export function createWorkerAdapter(port: MessagePort, options?: WorkerAdapterOptions): Adapter{
    return async function connectPeer(peer: AdapterNext) {
        let dead = false;

        function onSend(message: Frame) {
            if (dead) return;
            port.postMessage(codec.messageToWire(message));
        }

        function onMessage(event: MessageEvent) {
            if (event.data === 'STARTUP') return;
            peer.handleMessage(codec.messageFromWire(event.data));
        }

        function onClose(_err?: any) {
            if (dead) return;
            dead = true;
            port.removeEventListener('message', onMessage);
            port.close();
        }

        // Handshake: wait for worker to echo STARTUP before exchanging frames.
        await new Promise((resolve) => {
            port.addEventListener('message', onReadyMessage);
            port.postMessage('STARTUP');
            port.start();
            function onReadyMessage(d: MessageEvent) {
                if (d.data !== 'STARTUP') return;
                port.addEventListener('message', onMessage);
                port.removeEventListener('message', onReadyMessage);
                resolve(null);
            }
        });

        return {
            send: onSend,
            close: onClose
        };
    }
};
