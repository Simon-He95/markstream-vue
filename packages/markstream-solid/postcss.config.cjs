module.exports = {
  plugins: [require('postcss-import'), ...require('../../postcss.config.cjs').plugins],
}
