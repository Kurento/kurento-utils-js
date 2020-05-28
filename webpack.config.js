module.exports = {
  entry: './index.mjs',
  devtool: 'source-map',
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.m?js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
            plugins: [
              "@babel/plugin-proposal-class-properties",
              "@babel/plugin-proposal-private-methods"
            ]
          }
        }
      }
    ]
  },
  output: {
    path: __dirname,
    filename: 'kurento-utils.js',
    library: 'kurento-utils',
    libraryTarget: 'umd'
  }
}
