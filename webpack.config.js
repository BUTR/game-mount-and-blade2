// eslint-disable-next-line @typescript-eslint/no-var-requires
const webpack = require('vortex-api/bin/webpack').default;
const CopyPlugin = require("copy-webpack-plugin");

const config = webpack('game-mount-and-blade2', __dirname, 5);
config.plugins.push(new CopyPlugin({
    patterns: [
        { from: "**/Bannerlord.ModuleManager.Native.dll", to: "[name].[ext]" },
        { from: "src/*.jpg", to: "[name].[ext]" },
        { from: "src/*.png", to: "[name].[ext]" },
    ],
}));
config.module.rules.push({
    test: /\.node$/,
    loader: "node-loader",
});
module.exports = config;