const {name} = require('./package.json')


module.exports = {
  entry: './index.js',
  devtool: 'source-map',
  mode: 'production',
  output: {
    path: __dirname,
    filename: `${name}.min.js`,
    library: 'kurentoUtils',
    libraryTarget: 'umd',
    sourceMapFilename: `${name}.map`
  }
}
