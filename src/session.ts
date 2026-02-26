import { ErrorDisconnected, OperationError, ErrorExpiredOrInvalid, ErrorRejected } from './psionic';

export type ID = string;

export type Operation<Type extends string, Context> = {
    id: ID,
    type: Type,
    cleanup: () => void,
    reject: (error: OperationError) => void,
    context: Context
};

export type OperationGenerator = Operation<'generator', {
    name: string[];
    /** True while processing next/throw/return — prevents reentry. */
    busy?: boolean,
    target: any,
    generator?: AsyncGenerator<any, any, any>,
}>;

export type OperationOutboundCall = Operation<'outbound-call', {
    resolve: (value: any) => void,
    reject: (error: any) => void,
}>;

export type OperationInboundCall = Operation<'inbound-call', undefined>;

/** Tracks in-flight operations (promises, generators) for cleanup and policy enforcement. */
export type Session = {
    /** Look up an existing operation by id. */
    use<TypeName extends OperationTypes['type'] | undefined, Type extends Extract<OperationTypes, { type: TypeName }>>(type: TypeName | undefined, id: ID): (TypeName extends undefined ? OperationTypes : Type) | undefined;
    /** Register a new operation. */
    add<TypeName extends OperationTypes['type'], Type extends Extract<OperationTypes, { type: TypeName }>>(type: TypeName, context: Type['context'], reject: Type['reject']): Type;
    /** Clear all operations (e.g. on disconnect). */
    clear(reason?: string): void;
    /** Latest merged description of the peer's remote */
    remoteDescription?: any;
    /** Latest merged description of the peer's own state */
    localDescription?: any;
    /** Last generated ID */
    lastID?: ID;
    /** Persistent metadata for the session */
    meta: Record<string, any>;
};

export type OperationTypes = OperationGenerator | OperationOutboundCall | OperationInboundCall;

export type SessionOptions = {
    /** Timeout for in-flight operations in milliseconds. Default is 6 minutes. */
    timeout?: number;
    /** Custom setTimeout function. */
    setTimeout?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
    /** Custom clearTimeout function. */
    clearTimeout?: (id: ReturnType<typeof setTimeout>) => void;
    /** Maximum in-flight operations. Default is 16 per peer. */
    //maxOperation?: { [K in OperationTypes['type']]?: number };
    permitOperation?<TypeName extends OperationTypes['type'], Type extends Extract<OperationTypes, { type: TypeName }>>(type: TypeName, context: Type['context'], counts: Map<OperationTypes['type'], number>): boolean | Promise<boolean>;
    /** State to restore from a previous session. */
    restore?: {
        /** Latest merged description of the peer's remote */
        remoteDescription?: any;
        /** Latest merged description of the peer's own state */
        localDescription?: any;
        /** Last used ID from the previous session */
        lastID?: ID;
        /** Session metadata from the previous session */
        meta?: Record<string, any>;
    }
};

/** 
 * Creates a default session, which tracks in-flight local and remote peer operations as well as current state.
 * 
 * The session can be reused across multiple connections to allow for features like automatic resending of frames on reconnect.
 * Note that the operation calls themselves cannot be serialized, but the session can be reattached to a new peer in the same isolate.
 **/
export function createSession(opts: SessionOptions = {}): Session {
    const idGenerator = monotonicBase36Ids(opts.restore?.lastID);
    const permit = opts.permitOperation ?? ((type, _ctx, counts) => (counts.get(type) ?? 0) < 0x10);
    const timeout = opts.timeout ?? (1000 * 60 * 6); // Default timeout 6 minutes
    const setTimeoutFn = opts.setTimeout ?? setTimeout;
    const clearTimeoutFn = opts.clearTimeout ?? clearTimeout;
    const operation = new Map<ID, OperationTypes>();
    const counts = new Map<OperationTypes['type'], number>();
    const timers = new Map<ID, any>();

    function touch(id: ID) {
        clearTimeoutFn(timers.get(id));
        timers.set(id, setTimeoutFn(() => {
            const result = operation.get(id);
            if (!result) return;
            result.reject(new OperationError(ErrorExpiredOrInvalid));
        }, timeout));
    }

    const session = {
        remoteDescription: opts.restore?.remoteDescription,
        localDescription: opts.restore?.localDescription,
        lastID: opts.restore?.lastID,
        meta: opts.restore?.meta ?? {},
        get operations() { return counts; },

        use(type, id) {
            const result = operation.get(id);
            if (!result || (type !== undefined && result.type !== type)) return;
            touch(id);
            return result as Extract<OperationTypes, { type: typeof type }>;
        },
        add(type, context, reject) {
            if (!type) throw new Error('Operation type is required');
            if (!permit(type, context, counts)) {
                throw new OperationError(ErrorRejected);
            }
            let done = false;
            const id = idGenerator();
            session.lastID = id;
            const operationObj = {
                id,
                type,
                context,
                cleanup,
                reject: (error: OperationError) => {
                    if (done) return;
                    reject(error);
                    cleanup();
                },
            }

            function cleanup() {
                if (done) return;
                done = true;
                clearTimeoutFn(timers.get(id));
                timers.delete(id);
                operation.delete(id);
                counts.set(type, Math.max(0, (counts.get(type) ?? 1) - 1));
            }

            touch(id);
            operation.set(id, operationObj as OperationTypes);
            counts.set(type, (counts.get(type) ?? 0) + 1);
            return operationObj;
        },
        clear() {
            const copy = Array.from(operation.values());
            operation.clear();
            for (const value of copy) {
                value.reject(new OperationError(ErrorDisconnected));
            }
        }
    } as Session;

    return session;
}

/** Generates monotonic base-36 IDs, 0 - zzzzzzzzzz, before wrapping. */
export function monotonicBase36Ids(lastID?: ID): () => ID {
    let previous = lastID ? parseInt(lastID, 36) : 0;
    const maxValue = (36**10);
    return () => {
        const nextID = (previous + 1) % maxValue;
        previous = nextID;
        return nextID.toString(36) as ID;
    }
}
