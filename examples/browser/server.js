// to run the examples, you need babel-cli:
// $ npm i -g babel-cli
// $ babel-node server.js

var httpd = require('./webpack.devserver');
var harpy = require('../../lib/websocket');
var _ = require('lodash');

var dataset = require('./testdataset.json');

let Nominations = {
  query: function (opts) {
    opts = Object.assign({ page: 0, pageSize: 25, sort: 'name' }, opts);
    var items = _.sortBy(dataset, opts.sort);
    var page = {
      page: opts.page,
      pageSize: opts.pageSize,
      totalPages: Math.floor(dataset.length / opts.pageSize)
    };
    page.items = items.slice(opts.page * opts.pageSize, (opts.page + 1) * opts.pageSize);
    return page;
  }
};

// WS.createServer accepts an http server, or port/host options to
// start a standalone server.
harpy.createServer({ server: httpd }, function (client) {
  if (!client.token || client.token.length !== 5) {
	  return client.describe({ failed: true });
  }

  client.describe({ Nominations });
});
