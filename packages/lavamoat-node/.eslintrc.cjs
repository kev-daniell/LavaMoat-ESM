// @ts-check

/**
 * @type {import('eslint').Linter.Config}
 */
module.exports = {
  overrides: [
    {
      files: ['./test/**/*.js'],
      rules: {
        'n/no-missing-require': 'off',
      },
    },
  ],
  parserOptions: {
    sourceType: 'module',
  },
  ignorePatterns: ['/test/projects/**/*'],
}
