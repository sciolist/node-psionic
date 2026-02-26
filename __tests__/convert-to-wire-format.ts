import assert from 'assert'
import { AsyncFnKey, AsyncGenKey, Keyword, toCodecDescription } from '../src/psionic';

const allSimpleValues = () => ({
    'hello': 'world',
    number: 9,
    nested: {
        arrayValue: [1,2,3],
        isThisATest: true
    }
});

console.log('- Testing converting a description to the wire format');
assert.deepStrictEqual(
    toCodecDescription(allSimpleValues()),
    allSimpleValues(),
    'Plain values should be unchanged'
);

console.log('- Testing that functions are not allowed in the wire format');
assert.deepStrictEqual(
    toCodecDescription({ hello: async () => 'world' }),
    { hello: { [Keyword]: AsyncFnKey } },
    'Async functions should be replaced with transport keyword'
);

console.log('- Testing that async generator functions are not allowed in the wire format');
assert.deepStrictEqual(
    toCodecDescription({ hello: async function* () { yield 'world' } }),
    { hello: { [Keyword]: AsyncGenKey } },
    'Async generator functions should be replaced with transport keyword'
);

console.log('- Testing that functions are replaced with transport keywords even when nested in arrays');
assert.deepStrictEqual(
    toCodecDescription([{ hello: async () => 'world' }]),
    [{ hello: { [Keyword]: AsyncFnKey } }],
    'Function should be replaced with transport keyword even when nested in arrays'
);

console.log('- Testing that class instances are not allowed in descriptions');
assert.throws(
    () => toCodecDescription({ hello: new Date() }),
    'Date instances are not allowed in descriptions.'
);

console.log('- Testing that class instances are not allowed in descriptions');
assert.throws(
    () => toCodecDescription({ hello: new (class X {})() }),
    'Class instances are not allowed in descriptions.'
);

console.log('- Testing that objects without a prototype are not allowed in descriptions');
assert.throws(
    () => toCodecDescription({ hello: Object.create(null) }),
    'Objects without a prototype are not allowed in descriptions.'
);

console.log('- Testing that circular references are not allowed in descriptions');
let nest: any = {}; nest.nest = nest;
assert.throws(
    () => toCodecDescription(nest),
    'Circular references are not allowed in descriptions.'
);

console.log('- All convert to wire format tests passed successfully');
