import assert from 'assert'
import { createPeer } from '../src/psionic';
import { createPair } from './lib/adapter';

type Description ={ initial: boolean; hello?: string; third?: { value: string }; };

const left = createPeer({ description: { initial: true, hello: 'there' } as Description });
const right = createPeer({ });

console.log('- Testing that peers receive the initial descriptions');
await createPair(left, right);

assert.deepStrictEqual(right.remote, { initial: true, hello: 'there' });
assert.deepStrictEqual(left.remote, undefined);

console.log('- Testing that peers can update their descriptions and the other peer receives the updated description');
await left.describe({ initial: false, third: { value: 'key' } });

assert.deepStrictEqual(right.remote, { initial: false, third: { value: 'key' } });

console.log('- Testing that peers can merge updates to their descriptions and the other peer receives the merged description');
await left.describe(d => ({ ...d, third: { value: 'merged' } }));

assert.deepStrictEqual(right.remote, { initial: false, third: { value: 'merged' } });

console.log('- All describe tests passed successfully');
