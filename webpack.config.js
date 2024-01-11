const webpack = require('vortex-api/bin/webpack');
const CopyPlugin = require("copy-webpack-plugin");
const crypto = require("crypto");
const crypto_orig_createHash = crypto.createHash;
crypto.createHash = algorithm => crypto_orig_createHash(algorithm == "md4" ? "sha256" : algorithm)

const config = webpack.default('game-mount-and-blade2', __dirname, 4);
config.plugins.push(new CopyPlugin({
    patterns: [
        { from: "**/Bannerlord.LauncherManager.Native.dll", to: "[name].[ext]" },
        { from: "assets/*.jpg", to: "[name].[ext]" },
        { from: "assets/*.png", to: "[name].[ext]" },
        { from: "src/stylesheets/*.scss", to: "[name].[ext]" },
        { from: "assets/localization/**/*.xml", to: "localization_[contenthash].[ext]" },
    ],
}));
config.module.rules.push({
    test: /\.node$/,
    loader: "node-loader",
    options: {
        name: '[name].[ext]'
    }
});
module.exports = config;