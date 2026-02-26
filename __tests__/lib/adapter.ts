import { type Peer, type Frame, type Connection } from '../../src/psionic';
import { psionicCodec } from '../../src/codecs/psionic';
const codec = psionicCodec();

export async function createPair(leftPeer: Peer, rightPeer: Peer) {
    let leftMessages: Frame[] = [];
    let rightMessages: Frame[] = [];
    let right: Connection | undefined;
    let left: Connection | undefined;
    left = ({
        close: () => {},
        send: (message: Frame) => {
            console.log('L>', codec.messageToWire(message));
            leftMessages.push(message);
            queueMicrotask(() => {
                if (!rightPeer.connection) {
                    console.warn('Right peer is not connected yet, cannot deliver message');
                    return;
                }
                rightPeer.handleMessage(codec.messageFromWire(codec.messageToWire(message)));
            });
        }
    });
    right = ({
        close: () => {},
        send: (message: Frame) => {
            console.log('R>', codec.messageToWire(message));
            rightMessages.push(message);
            queueMicrotask(() => {
                if (!leftPeer.connection) {
                    console.warn('Left peer is not connected yet, cannot deliver message');
                    return;
                }
                leftPeer.handleMessage(codec.messageFromWire(codec.messageToWire(message)));
            });
        }
    });
    leftPeer.on('error', () => {});
    rightPeer.on('error', () => {});
    let pl = leftPeer.connect(async p => left, false);
    let pr = rightPeer.connect(async p => right, false);

    console.log('- Waiting for both peers to connect');
    await Promise.all([pl, pr]);
    console.log('- Both peers connected successfully');
    return { left, right, leftMessages, rightMessages };
}
