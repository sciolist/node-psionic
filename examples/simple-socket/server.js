// to run the examples, you need babel-cli:
// $ npm i -g babel-cli
// $ babel-node server.js
//
var harpy = require('../../');
var sleep = ms => new Promise(s => setTimeout(s, ms));

harpy.webSocket.createServer({ port: 3000 }, function (client) {
  client.describe({
    double: async function (x) {
      await sleep(1000);
      return x * 2;
    }
  });
});
