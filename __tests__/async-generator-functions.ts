import assert from 'assert'
import { createAsyncGeneratorFunction, createPeer, ErrorExpiredOrInvalid, ErrorGeneric } from '../src/psionic';
import { createPair } from './lib/adapter';

const description = {
    ok: async function *() {
        yield 'yield1';
        yield 'yield2';
        return 'ok';
    },
    fail: async function *() { throw new Error('fail') }
};

const left = createPeer({ description, sendErrorMessages: true });
const right = createPeer({ description, receiveErrorMessages: true });
await createPair(left, right);

const asyncFailInvoker = createAsyncGeneratorFunction(left, ["fail"]);
const asyncOkInvoker = createAsyncGeneratorFunction(left, ["ok"]);

console.log('- Testing basic async generator function call');
const okresult = asyncOkInvoker("hello");
assert.deepStrictEqual(
    await okresult.next(),
    { value: 'yield1', done: false },
    'The caller should receive the correct yielded value from the async generator'
);

await okresult.next();

assert.deepStrictEqual(
    await okresult.next(),
    { value: 'ok', done: true },
    'The caller should receive the correct return value from the async generator'
);

console.log('- Testing closing an async generator from the caller');
const breakresult = asyncOkInvoker("hello");
assert.deepStrictEqual(
    await breakresult.next(),
    { value: 'yield1', done: false },
    'The caller should receive the correct yielded value from the async generator'
);

assert.deepStrictEqual(
    await breakresult.return('return'),
    { value: 'return', done: true },
    'The caller should be able to close the async generator and receive the provided value'
);

assert.deepStrictEqual(
    await breakresult.next(),
    { value: undefined, done: true },
    'After an async generator is closed, it should be completed and not yield any further values'
);

console.log('- Testing throwing an error into an async generator from the caller');
const throwsresult = asyncOkInvoker("hello");
assert.deepStrictEqual(
    await throwsresult.next(),
    { value: 'yield1', done: false },
    'The caller should receive the correct yielded value from the async generator'
);

await throwsresult.throw('crash')
.then(() => {
    assert.fail('The caller should not resolve successfully when an error is thrown into the async generator');
})
.catch(err => {
    assert.strictEqual(
        err.message,
        ErrorGeneric.error,
        'The caller should receive a generic error message when an error is thrown into the async generator'
    );
});

assert.deepStrictEqual(
    await throwsresult.next(),
    { value: undefined, done: true },
    'After an error is thrown into the async generator and caught, it should be completed'
);

console.log('- Testing async generator function that throws an error');
const failresult = asyncFailInvoker("hello");
await failresult.next()
.then(() => {
    assert.fail('The caller should not resolve successfully when the async generator throws an error');
})
.catch(err => {
    assert.strictEqual(
        err.message,
        ErrorGeneric.error,
        'The caller should receive a generic error message when an async generator throws an error'
    );
});

assert.deepStrictEqual(
    await failresult.next(),
    { value: undefined, done: true },
    'After an async generator throws an error, it should be completed and not yield any further values'
);

console.log('- Testing concurrent async generator calls');
{
    const g1 = asyncOkInvoker();
    const g2 = asyncOkInvoker();

    assert.deepStrictEqual(await g1.next(), { value: 'yield1', done: false }, 'concurrent g1 should receive the first yield');
    assert.deepStrictEqual(await g2.next(), { value: 'yield1', done: false }, 'concurrent g2 should receive the first yield');
    assert.deepStrictEqual(await g1.next(), { value: 'yield2', done: false }, 'concurrent g1 should receive the second yield');
    await g2.return(undefined);
    assert.deepStrictEqual(await g1.next(), { value: 'ok', done: true }, 'concurrent g1 should receive the return value and be completed');
    assert.deepStrictEqual(await g2.next(), { value: undefined, done: true }, 'concurrent g2 should be completed after being returned');
}

console.log('- Testing async generator expiration');
{
    const g1 = asyncOkInvoker();
    assert.deepStrictEqual(await g1.next(),{ value: 'yield1', done: false },'The async generator should yield the first value correctly');
    right.session.clear();
    await g1.next()
    .then(() => { assert.fail('Expired generators should be cleaned up'); })
    .catch(err => {
        assert.strictEqual(
            err.message,
            ErrorExpiredOrInvalid.error,
            'The caller should receive a generic error message when interacting with an expired async generator'
        );
    });
    assert.deepStrictEqual(
        await g1.next(),
        { value: undefined, done: true },
        'After an async generator has expired, it should be completed and not yield any further values'
    );
}

console.log('- All async generator function tests passed successfully');
