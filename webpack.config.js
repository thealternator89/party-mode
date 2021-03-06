const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
    entry: {
        player: './src/playerclient/index.ts'
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/
            }
        ]
    },
    mode: 'development',
    resolve: {
        extensions: [ '.tsx', '.ts', '.js' ]
    },
    optimization: {
        minimizer: [new TerserPlugin()],
    },
    output: {
        filename: 'player.js',
        path: path.resolve(__dirname, 'static')
    }
}