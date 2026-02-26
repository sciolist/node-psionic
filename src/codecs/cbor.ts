import { AsyncFnKey, AsyncGenKey } from "../../src/psionic";

const TAG_ASYNC_FN  = 32768;
const TAG_ASYNC_GEN = 32769;

export type CborCodecOptions = {
    /** Max entities per message. Default: 4096. */
    maxEntities?: number;
}

export const cborCodec = function (options?: CborCodecOptions) {
    const maxEntities = options?.maxEntities ?? 0x1000;

    function messageToWire(message: any[]): Uint8Array {
        const scratch = new Uint8Array(0x10);
        const scratchView = new DataView(scratch.buffer);
        let output = new Uint8Array(0x200);
        let at = 0;
        function ensureSpace(bytes: number) {
            if (at + bytes <= output.length) return;
            let newsize = output.length * 2;
            while (newsize < at + bytes) newsize *= 2;
            if (newsize >= 0x3000000) {
                throw new Error('Message too large to encode');
            }
            const newBuffer = new Uint8Array(newsize);
            newBuffer.set(output);
            output = newBuffer;
        }
        function append(bytes: number[]) {
            ensureSpace(bytes.length);
            output.set(bytes, at);
            at += bytes.length;
        }
        const encoder = new TextEncoder();
        function writeItem(item: any) {
            if (typeof item === 'number' && Number.isInteger(item) && item >= 0) {
                writeUInt(0b000, item);
            } else if (typeof item === 'number' && Number.isInteger(item) && item < 0) {
                writeUInt(0b001, -1 - item);
            } else if (typeof item === 'string') {
                const bytes = encoder.encode(item);
                writeUInt(0b011, bytes.length);
                ensureSpace(bytes.length);
                output.set(bytes, at);
                at += bytes.length;
            } else if (Array.isArray(item)) {
                writeUInt(0b100, item.length);
                for (const subitem of item) {
                    writeItem(subitem);
                }
            } else if (item === AsyncFnKey) {
                writeUInt(0b110, TAG_ASYNC_FN);
                append([(0b111 << 5) | 22]); // null payload — only the tag matters
            } else if (item === AsyncGenKey) {
                writeUInt(0b110, TAG_ASYNC_GEN);
                append([(0b111 << 5) | 22]); // null payload — only the tag matters
            } else if (item && typeof item === 'object') {
                const entries = Object.entries(item);
                writeUInt(0b101, entries.length);
                for (const [key, value] of entries) {
                    const keyBytes = encoder.encode(key);
                    writeUInt(0b011, keyBytes.length);
                    ensureSpace(keyBytes.length);
                    output.set(keyBytes, at);
                    at += keyBytes.length;
                    writeItem(value);
                }
            } else if (item === false) {
                append([0b111 << 5 | 20]);
            } else if (item === true) {
                append([0b111 << 5 | 21]);
            } else if (item === null) {
                append([0b111 << 5 | 22]);
            } else if (item === undefined) {
                append([0b111 << 5 | 23]);
            } else if (typeof item === 'number') {
                const f32 = Math.fround(item);
                let bytes = 8;
                if (Number.isFinite(f32) && f32 === item) {
                    bytes = 4;
                }
                ensureSpace(bytes + 1);
                if (bytes === 4) scratchView.setFloat32(0, item, false);
                else scratchView.setFloat64(0, item, false);
                output[at++] = (0b111 << 5) | (bytes === 4 ? 26 : 27);
                for (let i = 0; i < bytes; i++) output[at++] = scratch[i];
            } else {
                throw new Error('Unsupported type');
            }
        }
        writeItem(message);
        return output.subarray(0, at);

        function writeUInt(majorTypeValue: number, num: number) {
            const majorType = majorTypeValue << 5;
            if (num < 24) {
                append([majorType | num]);
                return;
            }

            let length = 0;
            if (num > 0xFFFFFFFF) {
                length = 3;
            } else if (num > 0xFFFF) {
                length = 2;
            } else if (num > 0xFF) {
                length = 1;
            }
            const bytesNeeded = [1,2,4,8][length];
            if (bytesNeeded === 1) {
                scratchView.setUint8(0, num);
            } else if (bytesNeeded === 2) {
                scratchView.setUint16(0, num, false);
            } else if (bytesNeeded === 4) {
                scratchView.setUint32(0, num, false);
            } else if (bytesNeeded === 8) {
                scratchView.setBigUint64(0, BigInt(num), false);
            } else {
                throw new Error('Number too large for encoding');
            }
            ensureSpace(bytesNeeded + 1);
            output[at++] = majorType | (length + 24);
            for (let i = 0; i < bytesNeeded; i++) output[at++] = scratch[i];
        }
    };

    function messageFromWire(data: string | Uint8Array): any {
        function ensureBytes(bytes: number) {
            if (i + bytes > wire.length) {
                throw new Error('CBOR - Unexpected end of data');
            }
        }
        const wire = typeof data === 'string' ? new TextEncoder().encode(data) : data;
        const view = new DataView(wire.buffer, wire.byteOffset, wire.byteLength);
        const decoder = new TextDecoder();
        let i = 0, entities = 0;
        const result = takeNextValue();
        return result;

        function takeNextValue(): any {
            if (entities > maxEntities) throw new Error('CBOR - Maximum entities exceeded');
            entities += 1;
            ensureBytes(1);
            let value: any = null;
            const majorType = (wire[i] & 0b11100000) >> 5;
            const minorType = (wire[i] & 0b00011111);
            if (majorType === 0b000) {
                value = takeUInt(minorType);
            } else if (majorType === 0b001) {
                value = -1 - takeUInt(minorType);
            } else if (majorType === 0b011) {
                let length = takeUInt(minorType);
                ensureBytes(length);
                value = decoder.decode(wire.subarray(i, i + length));
                i += length;
            } else if (majorType === 0b100) {
                const length = takeUInt(minorType);
                value = [];
                for (let j = 0; j < length; j++) {
                    const item = takeNextValue();
                    value.push(item);
                }
            } else if (majorType === 0b101) {
                const length = takeUInt(minorType);
                value = {};
                for (let j = 0; j < length; j++) {
                    const key = String(takeNextValue());
                    const val = takeNextValue();
                    value[key] = val;
                }
            } else if (majorType === 0b110) {
                const tag = takeUInt(minorType);
                const taggedvalue = takeNextValue();
                if (tag === TAG_ASYNC_FN) return AsyncFnKey;
                if (tag === TAG_ASYNC_GEN) return AsyncGenKey;
                return taggedvalue;
            } else if (majorType === 0b111) {
                if (minorType === 20) value = false;
                else if (minorType === 21) value = true;
                else if (minorType === 22) value = null;
                else if (minorType === 23) value = undefined;
                else if (minorType === 26) {
                    ensureBytes(5);
                    i += 1;
                    value = view.getFloat32(i, false);
                    i += 4;
                } else if (minorType === 27) {
                    ensureBytes(9);
                    i += 1;
                    value = view.getFloat64(i, false);
                    i += 8;
                } else {
                    throw new Error('CBOR - Unsupported simple value');
                }
            } else {
                throw new Error('CBOR - Unsupported major type ' + majorType.toString(2).padStart(3, '0'));
            }
            return value;
        }

        function takeUInt(minorType: number): number {
            if (minorType < 24) {
                i += 1;
                return minorType;
            }

            const addl = minorType - 24;
            const bytes = [1,2,4,8][addl];
            if (bytes === undefined) throw new Error('CBOR - Integer too large to decode');
            ensureBytes(bytes + 1);
            let num: number;
            i += 1;
            if (bytes === 1) {
                num = view.getUint8(i);
            } else if (bytes === 2) {
                num = view.getUint16(i, false);
            } else if (bytes === 4) {
                num = view.getUint32(i, false);
            } else if (bytes === 8) {
                const bigNum = view.getBigUint64(i, false);
                if (bigNum > BigInt(Number.MAX_SAFE_INTEGER)) {
                    throw new Error('CBOR - Number too large to safely represent in JavaScript');
                }
                num = Number(bigNum);
            } else {
                throw new Error('CBOR - Unsupported integer byte length');
            }
            i += bytes;
            return num;
        }
    }

    return {
        type: 'binary' as const,
        messageFromWire,
        messageToWire
    };
}
