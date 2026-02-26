import { ErrorProtocolViolation, Keyword, OperationError} from "../psionic";

export type PsionicCodecOptions = {
    /** Max entities per message. Default: 4096. */
    maxEntities?: number;
}

export const psionicCodec = (options: PsionicCodecOptions = {}) => {
    const maxEntities = options.maxEntities ?? 0x1000;

    function messageToWire(message: any[]): Uint8Array | string {
        let str = String(message[0]);
        let j: number;
        for (j = message.length - 1; j >= 0; --j) {
            if (message[j] !== undefined) break;
        }
        for (let i = 1; i <= j; i++) {
            str += ' ' + JSON.stringify(message[i]);
        }
        return str;
    };

    function messageFromWire(data: Uint8Array | string): any {
        const wire = typeof data === 'string' ? data : new TextDecoder().decode(data);
        let braceStack = 0, arrayStack = 0, inString = 0, entityCount = 0;
        let formatted = [];
        let start = 0;
        let escaping = false;
        // Extract the op code (first space-delimited token).
        for (let i = 0; i <= wire.length; i++) {
            if (wire[i] === ' ') {
                const value = wire.slice(0, i);
                formatted.push(value);
                start = i + 1;
                break;
            }
        }
        // Parse remaining space-delimited values, respecting JSON nesting.
        for (let i = start; i <= wire.length; i++) {
            if (entityCount > maxEntities) {
                throw new OperationError(`${Keyword}: Maximum entity count exceeded`, ErrorProtocolViolation.code);
            }
            if (wire[i] === '{' && !inString) {
                braceStack++;
                entityCount++;
            } else if (wire[i] === '}' && !inString) {
                braceStack--;
            } else if (wire[i] === '[' && !inString) {
                arrayStack++;
                entityCount++;
            } else if (wire[i] === ']' && !inString) {
                arrayStack--;
            } else if (wire[i] === '\\' && inString) {
                escaping = !escaping;
            } else if (wire[i] === '"') {
                if (!escaping) inString = inString ? 0 : 1;
                escaping = false;
            } else if ((i === wire.length && start < i) || (wire[i] === ' ' && braceStack === 0 && arrayStack === 0 && !inString)) {
                entityCount++;
                const value = wire.slice(start, i);
                formatted.push(JSON.parse(value));
                start = i + 1;
            } else {
                escaping = false;
            }
        }
        return formatted;
    }

    return {
        type: 'text' as const,
        messageFromWire,
        messageToWire
    };
};
