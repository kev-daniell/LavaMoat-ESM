#!/usr/bin/env node
/* eslint-disable no-eval */

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { runLava } from './index.js'
import yargsFlags from './yargsFlags.js'

import defaults from './defaults.js'

runLava(parseArgs()).catch((err) => {
  // explicity log stack to workaround https://github.com/endojs/endo/issues/944
  console.error(err.stack || err)
  process.exit(1)
})

function parseArgs() {
  // Properly initialize yargs in ESM mode using hideBin
  const argsParser = yargs(hideBin(process.argv))
    // Configure as before
    .command(
      '$0 <entryPath>',
      'start the application (kevin-watermark)',
      (yargs) => {
        // the entry file to run (or parse)
        yargs.positional('entryPath', {
          describe:
            'the path to the entry file for your application. same as node.js',
          type: 'string',
        })
        yargsFlags(yargs, defaults)
      }
    )
    .help()

  const parsedArgs = argsParser.parse()

  // patch process.argv so it matches the normal pattern
  // e.g. [runtime path, entrypoint, ...args]
  // we'll use the LavaMoat path as the runtime
  // so we just remove the node path
  process.argv.shift()

  return parsedArgs
}
