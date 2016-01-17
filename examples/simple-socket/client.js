// to run the examples, you need babel-cli:
// $ npm i -g babel-cli
// $ babel-node client.js

var harpy = require('../../');

(async function () {
  var client = await harpy.webSocket.connect('ws://localhost:3000');
  let doubled = await client.double(5);
  console.log('5 doubled is ' + doubled + '! amazing!');
})().catch(ex => console.error(ex.stack));

