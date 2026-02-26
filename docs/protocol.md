# Psionic Protocol

The psionic protocol is kept intentionally minimal. These examples are shown using the psionic wire codec, designed to be easy to debug and interact with manually and in constrained environments, but the same protocol can be implemented over any transport layer and with any serialization format.

Each `frame` is a tuple of `[type, id, ...args]`

1. `type` is a single character string indicating the frame type

2. `id` is a string identifier that is written back in responses to the caller so they can correlate responses to their requests.

3. `args` is any additional data needed for the frame, which varies based on the frame type.

## Frame types

### *`D`* - Describe

**Example**
```
D "1" {"name":"Alice","greet":{"@@psion":"f"},"worker":{"@@psion":"g"}} true
```

Send a new set of capabilities and state to the remote peer. The sender provides a description object, which is a structure that contains any combination of nested objects, arrays, primitive values, and functions. The receiver gets a live-updating view of this description as it changes over time, and can call functions within it as if they were local.

#### Frame arguments:

1. `description`: A nested object containing any combination of primitive values, objects, arrays, and functions. `{"@@psion":"f"}` indicates a callable function, and `{"@@psion":"g"}` for async generators.

2. `swap` (optional): A boolean flag indicating whether the description should replace the existing remote description (`true`), or be merged with it (`false` or omitted). If `swap` is `true`, the provided description completely replaces the existing remote description. If `swap` is `false` or omitted, the provided description is merged with the existing remote description, allowing for incremental updates.

### *`C`* - Call

**Example**
```
C "2" ["greet"] ["Hello, %s!"]
```

Invoke a function on the remote peer. The caller provides the path to the function within the remote description, and an array of arguments to call it with. The callee receives the call, executes the function, and sends back a response frame with the result.

If the function is a generator, the callee instead sends an iterator ID, which can be iterated over the generator with `.` (next), `<` (return), and `>` (throw) frames.

#### Frame arguments:

1. `name`: An array of strings representing the path to the function within the remote description. For example, `["user", "load"]` would call `peer.remote.user.load()`.

2. `args`: An array of arguments to call the function with.

### *`K`* - OK

**Example**
```
K "2" "Hello, Alice!"
```

Send a successful response back to the caller after any frame that expects a response (e.g. `D`, `C`, `.`, `>`) The `id` field matches the `id` of the original call frame, so the caller can correlate the response to their request.

For iterators (`.`, `<`, `>`), responses are an array where the first item is a `yielded` value, and the second is a `0` or `1` indicating if the generator is done. Continuing to call `next` on a completed generator will return an error. 

#### Frame arguments:

1. `result`: The result of the call, which can be any value.

### *`E`* - Error

**Example**
```
E "2" 0 "Cannot greet user, server is shy."
```

Send an error response back to the caller after any frame that expects a response (e.g. `D`, `C`, `.`, `>`) The `id` field matches the `id` of the original call frame, so the caller can correlate the response to their request.

#### Frame arguments:

1. `code`: A numeric error code.

2. `error` (optional): A string describing the error.

### *`.`* - Iterator Next

**Example**
```
. "3" "iterator-1" "Next value"
```

Advance a remote iterator to its next yield point. The `operationId` field matches the return of the original call frame that created the iterator. The callee responds with either an `OK` frame containing the yielded value, or an `Error` frame if the iterator is completed or throws.

#### Frame arguments:

1. `operationId`: The ID of the iterator to advance, as returned by the original call frame.

2. `value`: An optional value to send into the generator, for `yield` expressions.

### `<` - Iterator Return

**Example**
```
< "3" "iterator-1" "Final value"
```

Stop the iteration of a remote iterator, completing it. The `operationId` field matches the return of the original call frame that created the iterator. The callee responds with an `OK` frame confirming completion, or an `Error` frame if the iterator is already completed or throws.

#### Frame arguments:

1. `operationId`: The ID of the iterator to close, as returned by the original `Call` frame.

2. `value`: An optional return value to send into the generator.

### `>` - Iterator Throw

**Example**
```
> "3" "iterator-1" 0 "Something went wrong"
```

Used to throw an error into a remote iterator. The `operationId` field matches the return of the original call frame that created the iterator. The callee responds with either an `OK` frame containing the value returned by the generator, or an `Error` frame if the iterator is already completed or throws.

#### Frame arguments:

1. `operationId`: The ID of the iterator to advance, as returned by the original `Call` frame.

2. `code`: A numeric error code.

3. `error` (optional): A string describing the error.

# Errors

There are some standard errors defined by the protocol, but applications are free to define their own error codes and messages as well.

## *`0`* - Remote error

The generic remote error code indicates that an error occurred on the remote peer while processing a request. The error message may contain additional details about the error, but this is not guaranteed.

## *`1`* - No remote assigned

This error indicates that a call was attempted without an active remote peer connection. This can happen if the peer has not yet connected to a remote, or if the connection was lost.

## *`2`* - Disconnected

This error indicates that the connection to the remote peer was lost while a request was in-flight. The request may or may not have been processed by the remote peer.

## *`3`* - Protocol violation

This error indicates that a message was received that does not conform to the expected protocol format. This can happen if someone is sending data leading to corrupted frames or missing arguments.

## *`4`* - Function not found

This error indicates that a call was made to a function that does not exist on the remote peer's description. This can happen if the caller has an outdated view of the remote description, or if the caller is trying to call a function that was never described.

## *`5`* - Expired or invalid

This error indicates that a call was made with an ID that is no longer valid. This can happen if the caller is trying to respond to a call that has already been responded to, or if the caller is trying to interact with an iterator that has already completed.

## *`6`* - Rejected

This error indicates that a call was rejected by the remote peer. This can happen if the remote peer is overloaded, or if the remote peer has some application-level logic for rejecting certain calls.
