// to run the examples, you need babel-cli:
// $ npm i -g babel-cli
// $ babel-node client.js MyName

import psionic from '../../lib/socket';

(async function () {
  const client = await psionic.connect({ port: 3000 }, {
    // optional context object to pass to the server
    describe: { username: process.argv[2] || 'world' }
  });

  // print messages from the servers description
  console.log(client.motd);

  // basic remote procedure call
  let success = await client.login('my-password');
  if (!success) throw new Error('login failed!');

  // calling 'login' gives us a new function to call!
  console.log(await client.greet());

  // we can pass over a new state for our client to the server
  await client.describe({ username: 'new-name' });

  // calling 'greet' again will give us our replaced name
  console.log(await client.greet());

  // you can also emit and subscribe to events
  await client.emit('thanks');

  client.close();
})()
.catch(ex => console.error(ex));
