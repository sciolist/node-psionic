import type { AdapterNext, Connection } from "../psionic";
import type { Session } from "../session";

type ResendAdaptable = {
    session: Session;
    handleMessage: (frame: any) => void;
    close: (ex?: any) => void;
};

export function resend(inner: (peer: AdapterNext) => Promise<Connection>): (peer: ResendAdaptable) => Promise<Connection> {
    return async function connectPeer(peer: ResendAdaptable) {
        const frames = (peer.session.meta.frames ??= []);
        const newAdapter = await inner({
            close: peer.close,
            session: peer.session,
            handleMessage: (frame) => {
                frames.length = 0;
                peer.handleMessage(frame);
            }
        });
        for (const frame of frames) {
            newAdapter.send(frame);
        }
        return {
            close: newAdapter.close,
            send: async (frame) => {
                if (frame[0] === 'K' || frame[0] === 'E') {
                    console.log(frame);
                    frames.push(frame);
                }
                newAdapter.send(frame);
            }
        };
    }
};
