# Extending Psionic

You can extend Psionic with new transport adapters, communication codecs and policies. The frames themselves are fixed by the protocol, but the way they are encoded and transmitted can be customized by implementing new codecs and transports.

## Codecs

A codec defines how frames are encoded into bytes for transmission, and decoded back into frames on the receiving end. There are built-in codecs for space-separated JSON messages and CBOR. The objects have a couple of symbols to indicate special values that aren't easily represented in JSON, such as `AsyncFnKey` and `AsyncGenKey`.

The `codec` interface is two functions, `messageFromWire` and `messageToWire`, which convert between frames and byte arrays or strings. There is also a `type` parameter which can be `text` or `binary`. You can create a new codec by implementing these functions to encode frames in a different format, such as MessagePack, Protobuf, or a custom binary format.

## Transport Adapters

A transport adapter defines how encoded frames are transmitted between peers. There are built-in transports for Node.js Sockets, Web Sockets and Web Workers. You can create a new transport by implementing the `Adapter` interface.

Look at the `nodestreams` example for a simple adapter that uses Node.js child process stdio streams as the transport layer.

## Operation Tracking and Policies

The `Session` keeps track of all in-flight operations (promises, generators, incoming calls) for the peer connection. It provides a way to correlate responses to their original requests, enforce timeouts, and clean up resources on disconnect. You can create a custom operation tracker by implementing the `Session` interface, or use the provided `createSession` function which provides a reasonable default implementation with configurable timeouts.
