const webpack = require('vortex-api/bin/webpack');
const CopyPlugin = require("copy-webpack-plugin");

const config = webpack.default('game-mount-and-blade2', __dirname, 4);
config.plugins.push(new CopyPlugin({
    patterns: [
        { from: "**/Bannerlord.LauncherManager.Native.dll", to: "[name].[ext]" },
        { from: "assets/*.jpg", to: "[name].[ext]" },
        { from: "assets/*.png", to: "[name].[ext]" },
        { from: "src/stylesheets/*.scss", to: "[name].[ext]" },
    ],
}));
config.module.rules.push({
    test: /\.node$/,
    loader: "node-loader",
});
module.exports = config;