import assert from 'assert'
import { fromCodecDescription, createPeer, AsyncGenKey, AsyncFnKey, isAsyncGeneratorLike, Keyword } from '../src/psionic';

const peer = createPeer();

const allSimpleValues = () => ({
    'hello': 'world',
    number: 9,
    nested: {
        arrayValue: [1,2,3],
        isThisATest: true
    }
});

console.log('- Testing converting a description from the wire format');
assert.deepStrictEqual(
    fromCodecDescription(peer, allSimpleValues()),
    allSimpleValues(),
    'Plain values should be unchanged'
);

console.log('- Testing that functions are not allowed in the wire format');
assert.throws(
    () => fromCodecDescription(peer, { hello: () => 'world' } as any),
    'Functions should throw an error, as they are not supported in the wire format'
);

console.log('- Testing that async function keywords are converted to actual async functions');
assert.ok(
    fromCodecDescription(peer, { hello: { [Keyword]: AsyncFnKey } }).hello() instanceof Promise,
    'Async functions keywords should be converted to actual async functions'
);

console.log('- Testing that async generator function keywords are converted to actual async generator functions');
assert.ok(
    isAsyncGeneratorLike(fromCodecDescription(peer, { hello: { [Keyword]: AsyncGenKey } }).hello),
    'Async generator functions keywords should be converted to actual async generator functions'
);

console.log('- Testing that Date instances are not allowed in the wire format');
assert.throws(
    () => fromCodecDescription(peer, { hello: new Date() }),
    'Date instances are not allowed in the wire format.'
);

console.log('- Testing that class instances are not allowed in the wire format');
assert.throws(
    () => fromCodecDescription(peer, { hello: new (class X {})() }),
    'Class instances are not allowed in the wire format.'
);

console.log('- Testing that objects without a prototype are not allowed in the wire format');
assert.throws(
    () => fromCodecDescription(peer, { hello: Object.create(null) }),
    'Objects without a prototype are not allowed in the wire format.'
);

console.log('- Testing that circular references are not allowed in the wire format');
let nest: any = {}; nest.nest = nest;
assert.throws(
    () => fromCodecDescription(peer, nest),
    'Circular references are not allowed in the wire format.'
);

console.log('- All convert from wire format tests passed successfully');
