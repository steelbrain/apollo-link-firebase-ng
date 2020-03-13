module.exports = {
  presets: [
    '@babel/typescript',
    [
      '@babel/env',
      {
        targets: {
          node: 10,
        },
      },
    ],
  ],
}
