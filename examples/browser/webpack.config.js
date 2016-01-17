var webpack = require('webpack');
var path = require('path');

module.exports = {
  devtool: 'source-map',
  entry: [ path.resolve('./client.js') ],
  output: {
    path: path.resolve('./dist'),
    filename: 'client.js'
  },
  module: {
    loaders: [
      { type: /\.jsx?$/, loader: 'babel', exclude: /node_modules|lib/ }
    ]
  }
};
