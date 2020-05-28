module.exports = {
  entry: './index.js',
  devtool: 'source-map',
  mode: 'production',
  output: {
    path: __dirname,
    filename: 'kurento-utils.js',
    library: 'kurento-utils',
    libraryTarget: 'umd'
  }
}
