// to run the examples, you need babel-cli:
// $ npm i -g babel-cli
// $ babel-node server.js

import psionic from '../../lib/socket';

// create a server on port 3000, callback is called when a user connects.
psionic.createServer({ port: 3000 }, function (client) {
  // the values on `client` can be changed by the user, so, don't trust them!
  let username = client.username;

  // the client will not be started until a describe call is made,
  // a promise will keep the clients waiting.
  client.describe({
    motd: "You've connected to the server, " + username + "!",
    login: async function (password) {
      if (password !== 'my-password') return false;
      console.log(username + ' has connected');
      // by calling describe again, we can change the functions
      // that the client has available to them.
      await client.describe(LoggedIn);
      return true;
    }
  });

  const LoggedIn = {
    greet: async function () {
      return 'Hello, ' + client.username + '!';
    }
  };

   // you can also emit and subscribe to events
  client.events.on('thanks', function () {
    console.log(username + ' says "thanks"!');
  });

  // 'state' events notify you on lower level events
  client.state.on('close', function () {
    console.log(username + ' has disconnected');
  });
});
