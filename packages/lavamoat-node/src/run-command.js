#!/usr/bin/env node
/* eslint-disable no-eval */

import fs from 'node:fs'
import path from 'node:path'
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
  const argsParser = yargs(hideBin(process.argv))
    .command(
      '$0',
      'lavamoat-run-command [flags for lavamoat] -- command [args for the command]',
      (yarn) => yargsFlags(yarn, defaults)
    )
    .help()

  const parsedArgs = argsParser.parse()
  const commandName = parsedArgs._[0]

  const binEntry = path.resolve(
    process.cwd(),
    './node_modules/.bin/',
    commandName
  )
  if (!fs.existsSync(binEntry)) {
    console.error(`Error: '${commandName}' is not one of the locally installed commands. Missing: '${binEntry}'
    Possible reasons for this error:
    - node_modules not installed
    - trying to run a globally installed script or command, 
      which is not supported and not recommended`)
    process.exit(4)
  }

  parsedArgs.entryPath = path.resolve(
    process.cwd(),
    'node_modules/.bin/',
    fs.readlinkSync(binEntry)
  )

  // patch process.argv so it matches the normal pattern
  // e.g. [runtime path, entrypoint, ...args]
  // we'll use the LavaMoat path as the runtime
  // so we just remove the node path
  process.argv = [process.argv[0], ...parsedArgs._]

  return parsedArgs
}
