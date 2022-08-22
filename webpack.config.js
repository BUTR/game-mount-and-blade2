// eslint-disable-next-line @typescript-eslint/no-var-requires
const webpack = require('vortex-api/bin/webpack').default;
const CopyPlugin = require("copy-webpack-plugin");

const config = webpack('game-mount-and-blade2', __dirname, 5);
config.node.__dirname = false;
config.plugins.push(new CopyPlugin({
    patterns: [
        { from: "**/Bannerlord.ModuleManager.Native.dll", to: "Bannerlord.ModuleManager.Native.dll" },
    ],
}));
config.module.rules.push({
    test: /\.node$/,
    loader: "node-loader",
});
module.exports = config;