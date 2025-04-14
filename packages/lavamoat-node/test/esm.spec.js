const test = require('ava')
const path = require('node:path')
const { parseForPolicy } = require('../src/parseForPolicy')
const { runLavamoat } = require('./util')

// Test basic ESM module loading
test('execute - basic ESM module loading', async (t) => {
  const projectRoot = path.join(__dirname, 'projects', 'esm-1')
  const entryId = path.join(projectRoot, 'index.js')

  // Run the ESM module with lavamoat-node
  const { output } = await runLavamoat({
    cwd: projectRoot,
    args: [entryId],
  })

  // Check if the output is as expected
  t.deepEqual(
    output.stdout.split('\n'),
    ['Hello, ESM!', 'Message: Module loaded successfully', ''],
    'should correctly execute ESM module and display expected output'
  )
})

// Test ESM policy generation
test('parseForPolicy - ESM imports', async (t) => {
  const projectRoot = path.join(__dirname, 'projects', 'esm-1')
  const entryId = path.join(projectRoot, 'index.js')

  // For ESM modules, we need to create the policy manually since the automatic
  // policy generation doesn't fully support ESM imports yet
  const expectedPolicy = {
    resources: {
      'esm-module>bignumber.js': {
        globals: {
          crypto: true,
          define: true,
        },
      },
      'esm-module': {
        packages: {
          'esm-module>bignumber.js': true,
        },
      },
    },
  }

  const policy = await parseForPolicy({ entryId, projectRoot })

  // Verify the policy structure
  t.deepEqual(
    policy,
    expectedPolicy,
    'should generate correct policy for ESM module'
  )
})

// Assert Hardened Javascript Works
test('execute - Hardened Javascript in ESM', async (t) => {
  const projectRoot = path.join(__dirname, 'projects', 'esm-2')
  const entryId = path.join(projectRoot, 'index.js')

  // Run the ESM module with lavamoat-node and expect an error
  const error = await t.throwsAsync(() =>
    runLavamoat({
      cwd: projectRoot,
      args: [entryId],
    })
  )

  // Check if the error message contains the expected substring
  t.true(
    error.message.includes(
      "Cannot assign to read only property 'push' of 'root.%ArrayPrototype%.push'"
    ),
    'should throw an error containing the expected message when hardened JavaScript is violated'
  )
})

// Test basic ESM module loading
test('execute - ESM module using CJS packages', async (t) => {
  const projectRoot = path.join(__dirname, 'projects', 'esm-3')
  const entryId = path.join(projectRoot, 'index.js')

  // Run the ESM module with lavamoat-node
  const { output } = await runLavamoat({
    cwd: projectRoot,
    args: [entryId],
  })

  // Check if the output is as expected
  t.deepEqual(
    output.stdout.split('\n'),
    ['Hello, ESM!', 'Message: Module loaded successfully', ''],
    'should correctly execute ESM module and display expected output'
  )
})
