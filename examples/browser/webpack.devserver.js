var express = require('express');
var app = express();
app.get('/', function (req, res) { res.sendFile(__dirname + '/index.html'); });

// build webpack files on the fly, to make things easier..
var WebpackDevMiddleware = require('webpack-dev-middleware');
var webpack = require('webpack');
app.use(WebpackDevMiddleware(webpack(require('./webpack.config.js'))));

// export http server
module.exports = app.listen(3000);
console.log('starting server on port 3000');
