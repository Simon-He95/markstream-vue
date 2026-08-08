module.exports = {
  presets: [
    '@vue/cli-plugin-babel/preset',
  ],
  plugins: [
    // Webpack 4 (acorn) can't parse some newer ECMAScript syntax used by the
    // renderer and its dependencies. Transform them so the bundled code remains compatible.
    '@babel/plugin-transform-numeric-separator',
    '@babel/plugin-transform-class-static-block',
    '@babel/plugin-transform-logical-assignment-operators',
    '@babel/plugin-transform-nullish-coalescing-operator',
    '@babel/plugin-transform-optional-chaining',
  ],
}
