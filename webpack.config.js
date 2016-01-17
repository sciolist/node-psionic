var webpack = require('webpack');
var path = require('path');

module.exports = {
  devtool: 'source-map',
  entry: [ 'expose?Harpy!' + path.resolve('./lib/browser.js') ],
  plugins: [
    new webpack.optimize.OccurenceOrderPlugin(),
    new webpack.optimize.UglifyJsPlugin({ compressor: { warnings: false } })
  ],
  output: {
    path: path.resolve('./dist'),
    filename: 'harpy.min.js'
  }
};
