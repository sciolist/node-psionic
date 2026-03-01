/**
 * Psionic - Live-updating, cross-language, bidirectional RPC protocol.
 */

import { type ID, type OperationGenerator, type Session, type OperationTypes, type OperationOutboundCall, createSession } from "./session";

const MAX_ID_LENGTH = 0x40;

export const Keyword = '@@psion' as const;
export let CallContextSymbol = Symbol('call-context');

// Sentinels for function types in codec format.
// WireCodec converts these to/from wire-safe representations.
export const AsyncFnKey = 'f';
export const AsyncGenKey = 'g';

export const STATE_DISCONNECTED = 0 as const;
export const STATE_CONNECTING = 1 as const;
export const STATE_CONNECTED = 2 as const;
export const STATE_LOCAL_DESCRIBED = 3 as const;
export const STATE_REMOTE_DESCRIBED = 4 as const;
export const STATE_READY = 5 as const;

export type ReadyState = typeof STATE_DISCONNECTED | typeof STATE_CONNECTING | typeof STATE_CONNECTED | typeof STATE_LOCAL_DESCRIBED | typeof STATE_REMOTE_DESCRIBED | typeof STATE_READY;

export const OpDescribe = 'D' as const;
export const OpCall = 'C' as const;
export const OpOK = 'K' as const;
export const OpError = 'E' as const;
export const OpIterNext = '.' as const;
export const OpIterReturn = '<' as const;
export const OpIterThrow = '>' as const;

export type CallFrame = [type: typeof OpCall, id: ID, name: string[], args: any[]];
export type DescribeFrame = [type: typeof OpDescribe, id: ID, description: any, swap?: boolean];
export type RespondFrame = [type: typeof OpOK, id: ID, result: any];
export type ErrorFrame = [type: typeof OpError, id: ID, code: number, error?: string];
export type IterNextFrame = [type: typeof OpIterNext, id: ID, operationId: ID, value: any];
export type IterReturnFrame = [type: typeof OpIterReturn, id: ID, operationId: ID, value: any];
export type IterThrowFrame = [type: typeof OpIterThrow, id: ID, operationId: ID, code: number, error?: string];
export type Frame = DescribeFrame | CallFrame | RespondFrame | ErrorFrame | IterNextFrame | IterReturnFrame | IterThrowFrame;

export type FrameOps = Frame[0];
type FrameArgs<K extends FrameOps> = Extract<Frame, [op: K, id: ID, ...any[]]> extends [K, any, ...infer R] ? R : never;
type FrameIDAndArgs<K extends FrameOps> = Extract<Frame, [op: K, ...any[]]> extends [K, ...infer R] ? R : never;

export const Errors = [
    { code: 0, error: `${Keyword}: Remote error` },
    { code: 1, error: `${Keyword}: No remote assigned` },
    { code: 2, error: `${Keyword}: Disconnected` },
    { code: 3, error: `${Keyword}: Protocol violation` },
    { code: 4, error: `${Keyword}: Function not found` },
    { code: 5, error: `${Keyword}: Expired or invalid` },
    { code: 6, error: `${Keyword}: Rejected` },
] as const;

export const ErrorGeneric = Errors[0];
export const ErrorNoRemote = Errors[1];
export const ErrorDisconnected = Errors[2];
export const ErrorProtocolViolation = Errors[3];
export const ErrorFunctionNotFound = Errors[4];
export const ErrorExpiredOrInvalid = Errors[5];
export const ErrorRejected = Errors[6];

type ErrorTypes = typeof Errors[number];

/** Codec for serializing frames to/from wire format. */
export type WireCodec = {
    type?: 'text' | 'binary';
    messageToWire: (message: any[]) => string | Uint8Array;
    messageFromWire: (wire: string | Uint8Array) => any[];
}

export type BasicDescription = { [key: string]: BasicValue; };
export type BasicValue =
    | string | number | boolean | null | undefined
    | ((...args: any[]) => Promise<any>)
    | ((...args: any[]) => AsyncGenerator<any, any, any>)
    | BasicDescription
    | BasicValue[]
    ;;

export type DescriptionValue<T> =
      [T] extends [(string | number | boolean | null | undefined)] ? T
    // strip context from functions in descriptions, since context is only relevant for in-flight operations, not for the remote's description of its API.
    //: typeof CallContextSymbol extends keyof T ? DescriptionValue<T[typeof CallContextSymbol]>
    : [T] extends [readonly (infer U)[]] ? DescriptionValue<U>[]
    : [T] extends [object] ? Description<T>
    : [T] extends [(...args: infer A extends any[]) => Promise<infer R>] ? (...args: A) => Promise<R>
    : [T] extends [(...args: infer A extends any[]) => AsyncGenerator<infer Y, infer R, infer N>] ? (...args: A) => AsyncGenerator<Y, R, N>
    : never
    ;



/** Infers concrete types for functions within a description. */
export type Description<T> = { [K in keyof T]: DescriptionValue<T[K]>; };

export type PeerEvents<RemoteAPI> = {
    readyStateChange: (readyState: ReadyState) => void;
    describe: (description: Description<RemoteAPI>) => void;
    error: (err: Error) => void;
    send: (frame: Frame) => void;
    message: (frame: Frame) => void;
};

/** Transport-level connection to a remote peer. */
export type Connection = {
    /** Send a frame to the remote. */
    send: (frame: Frame) => void;
    /** Close the connection and clean up resources. */
    close: (err?: any) => void;
}

/** Adapter interface for middleware or peers */
export type AdapterNext = {
    session: Session;
    handleMessage: Peer["handleMessage"];
    close: Peer["close"];
};

export type Adapter = (peer: Peer) => Promise<Connection>;

export type PeerOptions<LocalAPI extends BasicDescription> = {
    /** Initial description sent to the remote on connect. */
    description?: LocalAPI,
    /** Send full error messages to remote. Default: false. */
    sendErrorMessages?: boolean,
    /** Accept full error messages from remote. Default: false. */
    receiveErrorMessages?: boolean,
    session?: Session;
};

/** Represents a peer in the network. */
export type Peer<RemoteAPI extends BasicDescription = any, LocalAPI extends BasicDescription = any> = {
    session: Session;
    /** Send a frame to the remote peer. */
    send(...frame: any[]): void;
    /** Emit an event to local listeners. */
    emit(key: string, ...args: any[]): void;
    /** Handle an incoming message frame from the remote peer. */
    handleMessage(frame: Frame): void;
    /** Whether to send full error messages to remote. */
    sendErrorMessages?: boolean;
    /** Whether to accept full error messages from remote. */
    receiveErrorMessages?: boolean;
    /** Register an event listener. */
    on: <K extends keyof PeerEvents<RemoteAPI>>(key: K, listener: PeerEvents<RemoteAPI>[K]) => () => void;
    /** Remove an event listener. */
    off: <K extends keyof PeerEvents<RemoteAPI>>(key: K, listener: PeerEvents<RemoteAPI>[K]) => void;
    /** Connect to remote, describe local state, optionally wait for remote description. */
    connect(connect: Adapter, waitForRemoteDescribe?: boolean): Promise<void>,
    /** Remote's described state, with functions replaced by invokers. */
    remote?: Description<RemoteAPI>,
    /** Describe local state to remote. Accepts an object or an updater function. */
    describe: (stateChange: DescribeCallback<Description<LocalAPI>>) => Promise<void>;
    /** Close connection and clean up. Peer can reconnect after closing. */
    close(ex?: any): void;
    /** Copy of the most recently described local state. */
    local?: Description<LocalAPI>;
    /**
      * - `0` STATE_DISCONNECTED: The peer is not connected to any remote.
      * - `1` STATE_CONNECTING: The peer is currently connecting to a new remote.
      * - `2` STATE_CONNECTED: The peer is connected to a remote, but is not yet ready to use.
      * - `3` STATE_LOCAL_DESCRIBED: The peer has described itself, but not received a description.
      * - `4` STATE_REMOTE_DESCRIBED: The peer has received a description, but not described itself.
      * - `5` STATE_READY: The peer is ready to both send and receive messages.
      */
    readyState: ReadyState;
    /** Current remote connection, if any. */
    connection?: Connection;
    get ready(): boolean;
};

type EventEmitter<T> = {
    on: <K extends keyof T>(key: K, listener: T[K]) => () => void;
    off: <K extends keyof T>(key: K, listener: T[K]) => void;
}

/** Create a new event emitter instance. */
export function createEventEmitter() {
    const events: Record<string, Set<(...args: any[]) => void>> = {};

    function on(key: string, listener: (...args: any[]) => void) {
        if (!events[key]) events[key] = new Set();
        events[key].add(listener);
        return () => off(key, listener);
    }

    function emit(key: string, ...args: any[]) {
        if (events[key]) {
            const listeners = Array.from(events[key]);
            for (const listener of listeners) {
                try { listener(...args); }
                catch (ex) {
                    if (key !== 'error') emit('error', ex instanceof Error ? ex : new Error(String(ex)));
                }
            }
            return;
        }
        if (key === 'error') {
            console.error(`${Keyword} Unhandled error:`, ...args);
        }
    }

    function off(key: string, listener: (...args: any[]) => void) {
        if (events[key]) {
            events[key].delete(listener);
            if (events[key].size === 0) {
                delete events[key];
            }
        }
    }

    return { on, emit, off };
}

/** Either a full state object, or a state updater function. */
type DescribeCallback<T> = T | ((current: T) => T);

/** Events emitted by a Describer instance. */
type DescriberEvents<T> = {
    /** Emitted when the state changes. */
    change: (description: Description<T>, previous: Description<T>, swap?: boolean) => void;
};

/** A Describer instance manages state and emits events when the state changes. */
type Describer<T> = EventEmitter<DescriberEvents<T>> & {
    /** Get the complete current state. */
    currentState(): T;
    /** Describe a new state change. */
    describe: (stateChange: DescribeCallback<T>) => [prevState: T, newState: T, swap: boolean];
};

/** Create a new Describer instance, which holds state and emits events when state changes. */
export function createDescription<T>(initialState: T): Describer<T> {
    let state = initialState;
    const events = createEventEmitter();
    let result: Describer<T> = {
        currentState() { return state; },
        off: events.off,
        on: events.on,
        describe(stateChange) {
            const prev = state;
            let newState = prev;
            let swapped = true;
            if (typeof stateChange === 'function') {
                newState = (stateChange as ((current: T) => T))(prev);
                swapped = false;
            } else {
                newState = stateChange;
            }
            state = newState;
            if (newState !== prev) {
                events.emit('change', newState, prev, swapped);
            }
            return [prev, newState, swapped] as const;
        }
    };
    return result;
}


/** Create a new disconnected peer instance. */
export function createPeer<
    RemoteAPI extends BasicDescription = any,
    LocalAPI extends BasicDescription = any
>(opts?: PeerOptions<LocalAPI>): Peer<RemoteAPI, LocalAPI> {
    const publicEmitter = createEventEmitter();

    const session = opts?.session ?? createSession();
    const peer: Peer<RemoteAPI, LocalAPI> = {
        readyState: STATE_DISCONNECTED,
        session: session,
        emit: publicEmitter.emit,
        on: publicEmitter.on,
        off: publicEmitter.off,
        send: sendRawMessage,
        get ready() { return peer.readyState === STATE_READY; },
        close,
        describe,
        connect,
        sendErrorMessages: opts?.sendErrorMessages ?? false,
        receiveErrorMessages: opts?.receiveErrorMessages ?? false,
        connection: undefined,
        handleMessage: handleMessage,
    };
    peer.remote = session.remoteDescription ? fromCodecDescription(peer, session.remoteDescription) : peer.remote;
    if (opts?.description) peer.local = opts.description as Description<LocalAPI>;

    const describer = createDescription<Description<LocalAPI> | undefined>(peer.local);

    async function describe(stateChange: DescribeCallback<Description<LocalAPI>>) {
        const [prevState, newState, swap] = describer.describe(stateChange as any);
        peer.local = newState;
        if (peer.readyState < STATE_CONNECTED) return; // not connected, can't send.
        peer.session.localDescription = toCodecDescription(newState);
        const diff = swap ? (newState ?? {}) : diffDescriptions(prevState ?? {}, newState ?? {});
        if (diff === null) return; // unchanged, don't send.
        const encoded = toCodecDescription(diff);
        try {
            await sendAndWait(peer, OpDescribe, encoded, swap || undefined);
        } catch (ex) {
            // we can't safely roll back a describe — drop the connection on failure.
            close(new OperationError(ErrorProtocolViolation));
            throw ex;
        }
        if (peer.readyState === STATE_REMOTE_DESCRIBED) {
            peer.readyState = STATE_READY;
        } else if (peer.readyState < STATE_LOCAL_DESCRIBED) {
            peer.readyState = STATE_LOCAL_DESCRIBED;
        }
        peer.emit('readyStateChange', peer.readyState);
    };

    async function connect(newConnection: Adapter, waitForRemoteDescribe: boolean = true) {
        close(null);
        let previousLocal = peer.local;
        peer.readyState = STATE_CONNECTING;
        let previousConnection = peer.connection;
        const connection = await newConnection(peer);
        if ((peer.connection !== previousConnection) || (peer.readyState !== STATE_CONNECTING)) {
            connection.close();
            // If connection was already established or peer was closed during connection,
            // close the new connection and do not assign it.
            return;
        }
        peer.connection = connection;
        peer.local = previousLocal ?? (opts?.description as Description<LocalAPI> | undefined);
        peer.readyState = STATE_CONNECTED;
        peer.emit('readyStateChange', peer.readyState);
        if (peer.local) {
            await describe(peer.local);
        }
        if (waitForRemoteDescribe !== false) {
            await waitUntilRemoteReady(peer);
        }
    }

    function close(err: any) {
        if (peer.readyState === STATE_DISCONNECTED) return;
        peer.readyState = STATE_DISCONNECTED;
        peer.emit('readyStateChange', peer.readyState);
        if (peer.connection) {
            peer.connection.close(err);
        }
    }

    function sendRawMessage<K extends FrameOps>(type: K, ...message: FrameIDAndArgs<K>) {
        if (!peer.connection) throw new OperationError(ErrorNoRemote);
        const msg = [type, ...message];
        peer.connection.send(msg as any);
        peer.emit('send', msg);
    }

    function handleMessage(msg: Frame) {
        peer.emit('message', msg);
        handleIncomingMessage(peer, msg).catch(ex => {
            peer.emit('error', ex instanceof Error ? ex : new Error(String(ex)));
        })
    }

    return peer;
};

/** Resolves when remote has described itself. Rejects on disconnect. */
export function waitUntilRemoteReady(peer: Peer) {
    return new Promise<void>(function (resolve, reject) {
        if (peer.readyState >= STATE_REMOTE_DESCRIBED) return resolve();
        const cleanup = peer.on('readyStateChange', readyStateChange);
        function readyStateChange(readyState: ReadyState) {
            if (readyState >= STATE_REMOTE_DESCRIBED) {
                cleanup();
                resolve();
            }
            if (readyState === STATE_DISCONNECTED) {
                cleanup();
                reject(new OperationError(ErrorDisconnected));
            }
        }
    });
}

/** Converts a local description to wire-safe codec format (functions → sentinel symbols). */
export function toCodecDescription(description: any): any {
    const seen = new WeakSet();
    function replacer(v: any): any {
        const value = v?.[CallContextSymbol] ?? v;
        if (isAsyncGeneratorLike(value)) {
            return { [Keyword]: AsyncGenKey };
        }
        if (typeof value === 'function') {
            return { [Keyword]: AsyncFnKey };
        }
        if (value && typeof value === 'object') {
            if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) {
                throw new OperationError(ErrorProtocolViolation);
            }
            const result: any = Array.isArray(value) ? [] : {};
            if (seen.has(value)) {
                throw new OperationError(ErrorProtocolViolation);
            }
            seen.add(value);
            for (const key of Object.keys(value)) {
                if (key === Keyword) throw new OperationError(ErrorProtocolViolation);
                result[key] = replacer(value[key]);
            }
            return result;
        }
        return value;
    }
    const result = replacer(description ?? {});
    return result;
}

/** Converts a wire-format description into a usable object (sentinel symbols → invoker functions). */
export function fromCodecDescription(peer: Peer, description: any): any {
    const seen = new WeakSet();
    function replacer(value: any, currentPath: string[] = []): any {
        if (value?.[Keyword] === AsyncGenKey) return createAsyncGeneratorFunction(peer, currentPath);
        if (value?.[Keyword] === AsyncFnKey) return createAsyncFunction(peer, currentPath);
        if (typeof value === 'function') {
            throw new OperationError(ErrorProtocolViolation);
        }
        if (value && typeof value === 'object') {
            if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) {
                throw new OperationError(ErrorProtocolViolation);
            }
            if (seen.has(value)) {
                throw new OperationError(ErrorProtocolViolation);
            }
            seen.add(value);
            const result: any = Array.isArray(value) ? [] : {};
            for (const key of Object.keys(value)) {
                result[key] = replacer(value[key], [...currentPath, key]);
            }
            return result;
        }
        return value;
    }
    const result = replacer(description ?? {}) as BasicDescription;
    return result;
}

const AsyncGeneratorFunction: any = (async function* () { });

/** Creates a local async generator that proxies iteration to the remote. */
export function createAsyncGeneratorFunction(peer: Peer, name: string[]) {
    function wrappedAsyncGeneratorFunction(...args: any[]): AsyncGenerator<any, any, any> {
        let _operationId: ID | null = null;
        let closed = false;
        function wrapped<T>(fn: (value: any) => Promise<T>) {
            return (value: any) => {
                if (closed) return { value: undefined, done: true };
                try {
                    return fn(value).catch(handleError);
                } catch (err) {
                    handleError(err);
                    throw err;
                }
            }
            function handleError(err: any) {
                if (_operationId && !closed) {
                    const error = safeSendError(peer, err);
                    sendAndWait(peer, OpIterThrow, _operationId, error.code, error.error).catch(() => { });
                }
                closed = true;
                throw err;
            }
        }

        const nexter = wrapped(async sendValue => {
            const [value, done] = await sendAndWait(peer, OpIterNext, await operationId(), sendValue);
            if (done) closed = true;
            return { value, done: !!done };
        });

        const thrower = wrapped(async err => {
            const error = safeSendError(peer, err);
            const [value, done] = await sendAndWait(peer, OpIterThrow, await operationId(), error.code, error.error);
            if (done) closed = true;
            return { value, done: !!done };
        });

        const returner = wrapped(async value => {
            closed = true;
            await sendAndWait(peer, OpIterReturn, await operationId(), value).catch(() => { });
            return { value, done: true };
        });

        let iterator = {
            [Symbol.asyncIterator]() { return this; },
            next: nexter,
            throw: thrower,
            return: returner
        };

        async function operationId() {
            if (_operationId || closed) return _operationId;
            try {
                return _operationId = await sendAndWait(peer, OpCall, name, args);
            } catch (err: any) {
                closed = true;
                throw err;
            }
        }

        return iterator as any;
    };

    return markAsAsyncGenerator(wrappedAsyncGeneratorFunction);
}

/** Marks a function as an async generator, setting the appropriate properties. */
export function markAsAsyncGenerator<T>(wrappedAsyncGeneratorFunction: T): T {
    Object.defineProperties(wrappedAsyncGeneratorFunction, {
        [Symbol.toStringTag]: { value: AsyncGeneratorFunction[Symbol.toStringTag], writable: true },
        prototype: { value: AsyncGeneratorFunction.prototype, writable: true },
        constructor: { value: AsyncGeneratorFunction.constructor, writable: true }
    });
    return wrappedAsyncGeneratorFunction;
}


/** Sanitizes an error for sending, respecting sendErrorMessages policy. */
function safeSendError(peer: Peer, error: OperationError | { message?: string, code?: number } | string) {
    const code = typeof error === 'string' ? ErrorGeneric.code : (error.code ?? ErrorGeneric.code);
    if (!peer.sendErrorMessages) {
        return { code, error: (Errors[code] ?? ErrorGeneric).error };
    }
    if (typeof error === 'object') {
        return { code: error.code ?? 0, error: error.message };
    }
    if (typeof error === 'string') {
        return { code: ErrorGeneric.code, error };
    }
    return ErrorGeneric;
}

/** Sanitizes a received error, respecting receiveErrorMessages policy. */
function safeReceiveError(peer: Peer, error: OperationError | { message?: string, code?: number } | string): OperationError {
    let code = typeof error === 'string' ? ErrorGeneric.code : (error.code ?? ErrorGeneric.code);
    if (peer.receiveErrorMessages) {
        const message = typeof error === 'string' ? error : (error.message ?? Errors[code]?.error ?? ErrorGeneric.error);
        return new OperationError(message, code);
    }
    return new OperationError((Errors[code] ?? ErrorGeneric).error, code);
}

/** Creates a local async function that proxies calls to the remote. */
export function createAsyncFunction(peer: Peer, name: string[], waitForPeer: boolean = true) {
    return async function wrappedAsyncFunction(...args: any[]): Promise<any> {
        if (waitForPeer) await waitUntilRemoteReady(peer);
        return await sendAndWait(peer, OpCall, name, args);
    }
};

/** Sends a frame and returns a promise that resolves when the remote responds. */
function sendAndWait<K extends FrameOps>(peer: Peer, type: K, ...message: FrameArgs<K>): Promise<any> {
    return new Promise<any>(function (resolve, reject) {
        if (!peer.connection) return reject(new OperationError(ErrorNoRemote));
        let operation: OperationOutboundCall | undefined;
        try {
            operation = peer.session.add('outbound-call', { resolve, reject }, reject);
            peer.send(type, operation.id, ...message);
        } catch (ex: any) {
            operation?.cleanup();
            reject(ex);
        }
    });
}

const messageHandler: { [K in FrameOps]: (peer: Peer, session: Session, ...data: FrameIDAndArgs<K>) => (ErrorTypes | void) | Promise<ErrorTypes | void> } = {
    async [OpDescribe](peer, _session, id, description, swap) {
        if (typeof description !== 'object' || description === null || Array.isArray(description) || (swap !== undefined && swap !== null && typeof swap !== 'boolean')) {
            throw new OperationError(ErrorProtocolViolation);
        }
        const mapped = fromCodecDescription(peer, description);
        peer.remote = { ...(swap ? mapped : mergeDescriptions(peer.remote, mapped)) };
        peer.session.remoteDescription = toCodecDescription(peer.remote);
        let prevReadyState = peer.readyState;
        if (peer.readyState === STATE_LOCAL_DESCRIBED) {
            peer.readyState = STATE_READY;
        } else if (peer.readyState < STATE_REMOTE_DESCRIBED) {
            peer.readyState = STATE_REMOTE_DESCRIBED;
        }
        if (prevReadyState !== peer.readyState) {
            peer.emit('readyStateChange', peer.readyState);
        }
        peer.emit('describe', peer.remote);
        peer.send(OpOK, id);
    },
    async [OpCall](peer, session, id, name, args) {
        if (!Array.isArray(name) || !Array.isArray(args)) {
            throw new OperationError(ErrorProtocolViolation);
        }
        await handleInvocation(peer, session, id, name, args);
    },
    [OpOK](_peer, session, id, result) {
        const operation = session.use('outbound-call', id);
        if (!operation) return;
        operation.cleanup();
        operation.context.resolve(result);
    },
    [OpError](peer, session, id, code, error) {
        if (typeof code !== 'number') {
            // Invalid error frame — shut down to avoid error loops.
            peer.close();
            return;
        }
        const errorObj = safeReceiveError(peer, { code, message: error });
        const operation = session.use(undefined, id);
        if (!operation) return;
        operation.reject(errorObj);
    },
    async [OpIterNext](peer, session, id, operationId, value) {
        return await withGenerator(peer, session, id, operationId, async (operation) => {
            const result = await operation.context.generator!.next(value);
            if (result.done) operation.cleanup();
            return [result.value, result.done ? 1 : 0];
        });
    },
    async [OpIterReturn](peer, session, id, operationId, value) {
        return await withGenerator(peer, session, id, operationId, async (operation) => {
            const asyncGenerator = operation.context.generator;
            operation.cleanup();
            const result = await asyncGenerator!.return(value);
            return [result.value, result.done ? 1 : 0];
        }, false);
    },
    async [OpIterThrow](peer, session, id, operationId, code, error) {
        if (typeof code !== 'number' || (error !== undefined && typeof error !== 'string')) {
            throw new OperationError(ErrorProtocolViolation);
        }
        return await withGenerator(peer, session, id, operationId, async (operation) => {
            const err = safeReceiveError(peer, { code, message: error });
            const result = await operation.context.generator!.throw(err);
            if (result.done) operation.cleanup();
            return [result.value, result.done ? 1 : 0];
        });
    }
}

/** Executes an operation on an in-flight generator with protocol validation. */
async function withGenerator(peer: Peer, session: Session, id: ID, operationId: ID, fn: (operation: OperationGenerator) => Promise<any>, preventReentry: boolean = true) {
    if (!isValidID(operationId)) throw new OperationError(ErrorProtocolViolation);
    const operation = session.use('generator', operationId);
    if (!operation) throw new OperationError(ErrorExpiredOrInvalid);
    if (!exists()) {
        const err = new OperationError(ErrorFunctionNotFound);
        operation.reject(err);
        throw err;
    }
    if (operation.context.busy && preventReentry) {
        throw new OperationError(ErrorProtocolViolation);
    }
    try {
        operation.context.busy = true;
        const result = await fn(operation);
        if (!exists()) {
            operation.reject(new OperationError(ErrorFunctionNotFound));
            return peer.send(OpOK, id, [undefined, 1]);
        }
        else peer.send(OpOK, id, result);
    } catch (ex: any) {
        operation.cleanup();
        sendError(peer, id, ex?.code, ex);
        throw ex;
    } finally {
        operation.context.busy = false;
    }

    function exists() {
        const found = lookupFunction(peer.local, operation!.context.name);
        return found === operation?.context.target;
    }
}

function sendError(peer: Peer, id: ID, inCode: number, error?: any) {
    const str = error?.error ?? error?.message ?? error;
    const code = (typeof error === 'object' && typeof error.code === 'number' ? error.code : inCode) ?? ErrorGeneric.code;
    if (peer.readyState >= STATE_CONNECTED) {
        const sanitized = safeSendError(peer, { code, message: str });
        peer.send(OpError, id, sanitized.code, sanitized.error);
        return;
    }
    if (code !== ErrorNoRemote.code) {
        peer.emit('error', new OperationError(String(str ?? Errors[code]?.error ?? ErrorGeneric.error), code));
    }
}

/** Routes an incoming frame to the appropriate handler. */
async function handleIncomingMessage(peer: Peer, data: Frame) {
    if (!Array.isArray(data) || typeof data[0] !== 'string' || data[0].length !== 1) {
        return;
    }

    if (!isValidID(data[1])) throw new OperationError(ErrorProtocolViolation);

    const handler = messageHandler[data[0] as FrameOps];
    if (!handler) return;

    try {
        return await handler(peer, peer.session, ...data.slice(1) as FrameIDAndArgs<typeof data[0]>);
    } catch (err: any) {
        if (data[0] === OpError) {
            // Don't respond to invalid errors — avoids loops.
            peer.emit('error', err);
            return;
        }
        const error = safeSendError(peer, err);
        try {
            peer.send(OpError, data[1], error.code, error.error);
        } catch { }
        throw err;
    }
}

/** Resolves a dotted function path against a description object. */
function lookupFunction(origin: Description<any> | undefined, name: string[]): any {
    if (origin === undefined || origin === null) return null;
    let target: any = origin;
    for (let i = 0; target && i < name.length; ++i) {
        if (Object.prototype.hasOwnProperty.call(target, name[i])) {
            target = target[name[i]];
        } else {
            return null;
        }
    }
    if (typeof target !== 'function') return null;
    return target;
}

/** Context value that can be passed in to described functions */
export type CallContext = { peer: Peer, id: ID, operation: OperationTypes };
type HasContext<T> = { [CallContextSymbol]: T };
type RemoveFirstParameter<T> = T extends (first: CallContext, ...args: infer U) => infer R ? (...args: U) => R : never;
/** Wraps a function to automatically provide a call context. */
export function withContext<T extends Function>(fn: T): RemoveFirstParameter<T> | HasContext<RemoveFirstParameter<T>> {
    const fail = () => { throw new Error("withContext functions cannot be wrapped."); };
    (fail as any)[CallContextSymbol] = fn;
    return fail as any;
}

/** Handles an incoming RPC call or generator creation. */
async function handleInvocation(peer: Peer, session: Session, id: ID, name: string[], args: any[]) {
    let operation: OperationTypes | undefined = undefined;
    try {
        let target = lookupFunction(peer.local, name);
        if (!target || typeof target !== 'function') {
            throw new OperationError(ErrorFunctionNotFound);
        }
        const cctx: any = { peer, id };
        let callArgs = args;
        if (CallContextSymbol in target) {
            callArgs = [cctx, ...args];
            target = target[CallContextSymbol];
        }

        let complete = false;
        if (isAsyncGeneratorLike(target)) {
            // async generator fn
            let context: OperationGenerator['context'] = { target, name };
            operation = session.add('generator', context, function (_err) {
                if (complete || !context.generator) return;
                complete = true;
                context.generator.return(undefined).catch(() => { });
            });
            cctx.operation = operation;
            if (!operation) return peer.send(OpError, id, ErrorRejected.code, ErrorRejected.error);
            context.generator = target(...callArgs);
            peer.send(OpOK, id, operation.id);
        } else {
            // plain async fn
            operation = session.add('inbound-call', undefined, (err) => {
                if (complete) return;
                complete = true;
                try {
                    sendError(peer, id, err?.code ?? ErrorGeneric.code, err)
                } catch (ex) { }
            });
            cctx.operation = operation;
            if (!operation) return peer.send(OpError, id, ErrorRejected.code, ErrorRejected.error);
            const result = await Promise.resolve().then(() => target(...callArgs));
            if (complete) return;
            complete = true;
            operation.cleanup();
            peer.send(OpOK, id, result);
        }
    } catch (ex: any) {
        if (operation) {
            operation.cleanup();
        }
        sendError(peer, id, ex?.code ?? ErrorGeneric.code, ex);
        throw ex;
    }
}

export class OperationError extends Error {
    code: number;
    constructor(ex: ErrorTypes | string, code?: number) {
        if (typeof ex === 'string') {
            super(ex);
            this.code = code ?? ErrorGeneric.code;
        } else {
            super(ex.error);
            this.code = code ?? ex.code;
        }
    }
}

export function isAsyncGeneratorLike(value: any): boolean {
    if (typeof value !== 'function') return false;
    if (value.constructor?.name === 'AsyncGeneratorFunction') return true;
    if (value.prototype?.[Symbol.asyncIterator]) return true; // bun compat
    return false;
}

/** Returns a shallow diff of two descriptions, or null if unchanged. */
function diffDescriptions(prev: { [key: string]: any }, next: { [key: string]: any }): object | null {
    const stack = [{ prev: prev as any, next: next as any, path: [] as string[] }];
    const diffResult: any = {};
    let changed = false;
    while (stack.length > 0) {
        const { prev, next, path } = stack.pop()!;
        if (prev === next) continue;
        if (typeof prev === 'function' && typeof next === 'function' && isAsyncGeneratorLike(prev) === isAsyncGeneratorLike(next)) {
            continue; // Same-shaped functions don't need re-describing.
        } else if (Array.isArray(prev) && Array.isArray(next)) {
            if (prev.length !== next.length) {
                changed = true;
                addChange(next);
            } else if (prev.some((item, index) => item !== next[index])) {
                changed = true;
                addChange(next);
            }
        } else if (typeof prev === 'object' && typeof next === 'object' && prev !== null && next !== null) {
            const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);
            for (const key of allKeys) stack.push({ prev: prev[key], next: next[key], path: [...path, key] });
        } else {
            changed = true;
            addChange(next);
        }
        function addChange(next: any) {
            let current = diffResult;
            for (let i = 0; i < path.length - 1; ++i) {
                if (!(path[i] in current)) {
                    current[path[i]] = {};
                }
                current = current[path[i]];
            }
            current[path[path.length - 1]] = next ?? null;
        }
    }
    if (!changed) return null;
    return diffResult;
}

/** Deep-merges a patch into a description. Null values delete keys. */
export function mergeDescriptions(original: any, patch: any): any {
    const result = { ...original };
    for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === undefined) {
            delete result[key];
        } else if (Array.isArray(value) || Array.isArray(result[key])) {
            result[key] = value;
        } else if (typeof value === 'object' && value !== null && typeof result[key] === 'object' && result[key] !== null) {
            result[key] = mergeDescriptions(result[key], value);
        } else {
            result[key] = value;
        }
    }
    return result;
}

function isValidID(id: any): id is ID { return typeof id === 'string' && id.length > 0 && id.length < MAX_ID_LENGTH; }
