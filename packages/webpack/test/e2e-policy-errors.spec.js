const test = /** @type {import('ava').TestFn} */ (require('ava'))
const { scaffold, runScriptWithSES } = require('./scaffold.js')
const { makeConfig } = require('./fixtures/main/webpack.config.js')
const path = require('node:path')

test('webpack/policy-errors - policy-overrides get applied', async (t) => {
  const webpackConfig = makeConfig({
    emitPolicySnapshot: true,
    policyLocation: path.resolve(__dirname, 'fixtures/main/policy-broken'),
  })
  const build = await scaffold(webpackConfig)
  t.throws(
    () => {
      runScriptWithSES(build.snapshot['/dist/app.js'])
    },
    {
      message:
        'Policy does not allow importing umd-package from commonjs-package',
    }
  )
})

test('webpack/policy-errors - policy-overrides get applied on generated', async (t) => {
  const webpackConfig = makeConfig({
    generatePolicy: true,
    emitPolicySnapshot: true,
    policyLocation: path.resolve(__dirname, 'fixtures/main/policy-broken'),
  })
  const build = await scaffold(webpackConfig)
  t.throws(
    () => {
      runScriptWithSES(build.snapshot['/dist/app.js'])
    },
    {
      message:
        'Policy does not allow importing umd-package from commonjs-package',
    }
  )
})

test('webpack/policy-errors - denies globals', async (t) => {
  const webpackConfig = makeConfig({
    generatePolicy: false,
    emitPolicySnapshot: true,
    policyLocation: path.resolve(__dirname, 'fixtures/main/policy-deny'),
  })
  webpackConfig.entry = {
    app: './hack2.js',
  }
  const build = await scaffold(webpackConfig)
  t.throws(
    () => {
      runScriptWithSES(build.snapshot['/dist/app.js'], {
        console: { ...console },
        fetch: () => {},
      })
    },
    {
      message: 'fetch is not a function',
    }
  )
})
