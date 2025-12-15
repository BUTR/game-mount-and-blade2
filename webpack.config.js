// eslint-disable-next-line @typescript-eslint/no-require-imports
const webpack = require('vortex-api/bin/webpack').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const CopyPlugin = require('copy-webpack-plugin');

const config = webpack('game-mount-and-blade2', __dirname, 5);

config.plugins.push(
  new CopyPlugin({
    patterns: [
      { from: '**/Bannerlord.LauncherManager.Native.dll', to: '[name][ext]' },
      { from: 'assets/*.jpg', to: '[name][ext]' },
      { from: 'assets/*.png', to: '[name][ext]' },
      { from: 'assets/*.svg', to: '[name][ext]' },
      { from: 'src/stylesheets/*.scss', to: '[name][ext]' },
      { from: 'assets/localization/**/*.xml', to: 'localization_[contenthash][ext]' },
    ],
  })
);
config.module.rules.push({
  test: /\.node$/,
  loader: 'native-addon-loader',
  options: {
    name: '[contenthash].[ext]',
  },
});
module.exports = config;
