import type { WireCodec, Frame, AdapterNext, Adapter } from "../psionic";
import { Socket } from "net";
import { psionicCodec } from "../codecs/psionic";

export const ErrorFrameTooLarge = 'Frame size exceeds maximum allowed';

export type NodeSocketAdapterOptions = {
    /** Optional codec to use for encoding/decoding messages. Default: `defaultCodec`. */
    codec?: WireCodec;
    /** Max frame size in bytes. Default: 1MB. */
    maxFrameSize?: number;
};

const slice = Uint8Array.prototype.slice;

/** Adapter for Node.js TCP sockets. */
export function createNodeSocketAdapter(socket: Socket, opts?: NodeSocketAdapterOptions): Adapter {
    return async function connectPeer(next: AdapterNext) {
        const maxFrameSize = opts?.maxFrameSize ?? 1_048_576;
        const codec: WireCodec = opts?.codec ?? psionicCodec();
        const newline = '\n';
        let readdata = Buffer.alloc(0x1000);
        let readlen = 0;
        let dead = false;
    
        if (socket.readyState === 'closed') {
            throw new Error('Socket is already closed');
        }

        function onSend(message: Frame) {
            try {
                const bytes = codec.messageToWire(message);
                if (codec.type === 'binary') {
                    const len = toVariableByteLength(bytes.length);
                    socket.write(Buffer.concat([len, bytes as Uint8Array]));
                } else {
                    socket.write(bytes + newline);
                }
            } catch (ex) {
                teardown(ex instanceof Error ? ex : new Error(String(ex)));
            }
        }

        function onMessage(chunk: Buffer) {
            if (chunk.byteLength + readdata.byteLength > maxFrameSize) {
                teardown(new Error(ErrorFrameTooLarge));
                return;
            }
            if (chunk.byteLength > readdata.length - readlen) {
                const newBuffer = Buffer.alloc(Math.min(maxFrameSize, readdata.length) * 2);
                readdata.copy(newBuffer, 0, 0, readlen);
                readdata = newBuffer;
            }
            chunk.copy(readdata, readlen);
            readlen += chunk.byteLength;
            let i = 0;
            while (i < readlen) {
                let messageData: any;
                let view = new DataView(readdata.buffer, i, readlen - i);
                if (codec.type === 'binary') {
                    if (view.byteLength < 4) break;
                    const nlength = checkNumberLength(view);
                    const length = readNumber(view, nlength);
                    if (length === -1) break;
                    if (length > maxFrameSize) {
                        teardown(new Error(ErrorFrameTooLarge));
                        return;
                    }
                    if (view.byteLength < nlength + length) break;

                    const data = view.buffer.slice(nlength + view.byteOffset, nlength + view.byteOffset + length);
                    i += nlength + length;
                    messageData = codec.messageFromWire(new Uint8Array(data));
                    try {
                        next.handleMessage(messageData as Frame);
                    } catch (ex) {
                        teardown(ex instanceof Error ? ex : new Error(String(ex)));
                        return;
                    }
                } else {
                    const lineIndex = readdata.indexOf(0x0A, i);
                    if (lineIndex === -1 && readlen > maxFrameSize) {
                        teardown(new Error(ErrorFrameTooLarge));
                        return;
                    }
                    if (lineIndex === -1) break;
                    const data = slice.call(readdata, i, lineIndex);
                    i = lineIndex + 1;
                    try {
                        const messageData = codec.messageFromWire(data);
                        next.handleMessage(messageData as Frame);
                    } catch (ex) {
                        teardown(ex instanceof Error ? ex : new Error(String(ex)));
                        return;
                    }
                }
            }

            readdata.copy(readdata, 0, i, readlen);
            readlen -= i;
        }

        function teardown(ex: any) {
            onClose(ex);
            throw ex;
        }

        function onClose(ex: any) {
            if (dead) return;
            dead = true;
            socket.off('data', onMessage);
            socket.off('close', onClose);
            socket.destroy(ex);
            next.close(ex);
        }

        socket.on('data', onMessage);
        socket.on('close', ex => onClose(ex ?? new Error('Socket closed')));

        async function waitUntilOpen(): Promise<void> {
            return await new Promise((resolve, reject) => {
                if (socket.readyState === 'open') return resolve();
                socket.once('open', opener);
                socket.once('connect', opener);
                socket.once('close', closer);
                function opener() {
                    socket.off('open', opener);
                    socket.off('connect', opener);
                    socket.off('close', closer);
                    resolve();
                }
                function closer() {
                    socket.off('open', opener);
                    socket.off('close', closer);
                    reject(new Error('Socket closed before connection could be established'));
                }
            });
        }

        await waitUntilOpen();
        return {
            send: onSend,
            close: onClose
        }
    }
}

/** Encodes a length as a 1/2/4-byte variable-length integer (2-bit length prefix). */
function toVariableByteLength(value: number): Uint8Array {
    if (value < 64) {
        const view = new DataView(new ArrayBuffer(1));
        view.setUint8(0, value);
        return new Uint8Array(view.buffer);
    }
    if (value < (0b01 << 14)) {
        const view = new DataView(new ArrayBuffer(2));
        view.setUint16(0, (0b01 << 14) | value);
        return new Uint8Array(view.buffer);
    }
    if (value < (0b01 << 30)) {
        const view = new DataView(new ArrayBuffer(4));
        view.setUint32(0, (0b10 << 30) | value);
        return new Uint8Array(view.buffer);
    }
    throw new Error('Value too large for variable byte length encoding');
}

function checkNumberLength(value: DataView) {
    switch (value.getUint8(0) >> 6) {
        case 0b00: return 1;
        case 0b01: return 2;
        case 0b10: return 4;
    }
    return Number.MAX_SAFE_INTEGER;
}

function readNumber(value: DataView, bytes: number) {
    if (bytes > value.byteLength - bytes - 1) return -1;
    if (bytes === 1) return value.getUint8(0) & 0b0011_1111;
    if (bytes === 2) return value.getUint16(0) & 0b0011_1111_1111_1111;
    if (bytes === 4) return value.getUint32(0) & 0b0011_1111_1111_1111_1111_1111_1111_1111;
    return Number.MAX_SAFE_INTEGER;
}
