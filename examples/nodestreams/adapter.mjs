import { createSession } from "psionic/session";
import { psionicCodec } from "psionic/codecs/psionic";

export function createStreamAdapter(readable, writable) {
    const codec = psionicCodec(); // using the text-based codec for examples.
    return async (peer) => {
        let buffer = '';
        readable.on('data', chunk => {
            buffer += chunk;
            let newline;
            while ((newline = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, newline);
                buffer = buffer.slice(newline + 1);
                if (line) peer.handleMessage(codec.messageFromWire(line));
            }
        });
        function close() {
            writable.off('close', close);
            readable.off('close', close);
            peer.close();
        }
        writable.on('close', close);
        readable.on('close', close);

        return {
            session: createSession(),
            send(frame) {
                writable.write(codec.messageToWire(frame) + '\n');
            },
            close() {
                readable.destroy();
                writable.destroy();
            }
        };
    };
}