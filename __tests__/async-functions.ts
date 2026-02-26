import assert from 'assert'
import { createAsyncFunction, createPeer, ErrorFunctionNotFound, ErrorGeneric } from '../src/psionic';
import { createPair } from './lib/adapter';

const description = {
    ok: async (msg: string) => { return msg },
    fail: async () => { throw new Error('fail') }
};

const left = createPeer({ description, sendErrorMessages: true });
const right = createPeer({ description, receiveErrorMessages: true });
const pair = await createPair(left, right);

const asyncOkInvoker = createAsyncFunction(left, ["ok"], false);
const asyncFailInvoker = createAsyncFunction(left, ["fail"], false);
const asyncFailInvokerRight = createAsyncFunction(right, ["fail"], false);
const asyncMissingInvoker = createAsyncFunction(left, ["missing"], false);

console.log('- Testing basic async function call');
await asyncOkInvoker("hello")
.then(result => {
    assert.strictEqual(result, 'hello', 'The caller should receive the correct result from the async function call')
});

console.log('- Testing async function call that throws an error - the caller should receive a generic error message because debugErrors is not enabled on the callee peer');
await asyncFailInvoker()
.catch(err => {
    assert.strictEqual(err.message, ErrorGeneric.error, 'The caller should receive a generic error message when debugErrors is not enabled on the callee peer');
});

console.log('- Testing async function call that throws an error - the caller should receive the original error message because debugErrors is enabled on the callee peer');
await asyncFailInvokerRight()
.catch(err => {
    assert.strictEqual(err.message, 'fail', 'The caller should receive the original error message when debugErrors is enabled on the callee peer');
});

console.log('- Testing async function call to a non-existent function - the caller should receive a function not found error');
await asyncMissingInvoker()
.catch(err => {
    assert.strictEqual(err.message, ErrorFunctionNotFound.error, 'The caller should receive a function not found error when calling a non-existent function');
});

console.log('- All async function tests passed successfully');
