// @ts-check

/**
 * Prepares test fixture directories for use by the test suite using an
 * arbitrary package manager set via the `LAVAMOAT_PM` env var.
 *
 * @packageDocumentation
 */

import Module from 'node:module'
import path from 'node:path'
import { execFile, spawnSync } from 'node:child_process'
import { promisify } from 'node:util'
import { rm, readdir, readFile } from 'node:fs/promises'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const exec = promisify(execFile)

// Get current file directory (equivalent to __dirname in CJS)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * @todo Change this to `npm@latest` when Node.js v16 support is dropped
 */
const LAVAMOAT_PM = process.env.LAVAMOAT_PM ?? 'npm@9'
const PROJECTS_DIR = path.join(__dirname, 'projects')

/**
 * Environment variables for corepack support
 */
const COREPACK_ENV = {
  // Corepack refuses to run package managers other than the one declared in packageManager by default
  COREPACK_ENABLE_PROJECT_SPEC: '0',
}

// Find corepack package.json in node_modules - look in root project
const NODE_MODULES_BASE = path.resolve(__dirname, '../../../node_modules')
const COREPACK_PACKAGE_PATH = path.join(
  NODE_MODULES_BASE,
  'corepack',
  'package.json'
)

// Read corepack package.json
const corepackPkg = JSON.parse(await readFile(COREPACK_PACKAGE_PATH, 'utf8'))
const COREPACK_PATH = path.dirname(COREPACK_PACKAGE_PATH)

/**
 * Path to `corepack` executable from workspace root
 */
const COREPACK_BIN = path.resolve(COREPACK_PATH, corepackPkg.bin.corepack)

/**
 * Blast `node_modules` in `cwd`
 *
 * @param {string} cwd - Project dir
 * @returns {Promise<void>}
 */
async function clean(cwd) {
  const nodeModulesPath = path.join(cwd, 'node_modules')
  await rm(nodeModulesPath, { recursive: true, force: true })
}

/**
 * Resolves a module's installation path (_not_ entry point) from some other
 * directory.
 *
 * @param {string} cwd - Some other directory
 * @param {string} moduleId - Module to resolve
 * @returns {string} Resolved dir path
 */
function resolveDependencyFrom(cwd, moduleId) {
  return path.dirname(
    Module.createRequire(path.join(cwd, 'index.js')).resolve(
      `${moduleId}/package.json`
    )
  )
}

/**
 * Some native packages may not ship binaries for Apple silicon, so we have to
 * rebuild them
 *
 * @param {string} cwd
 */
async function setupAppleSilicon(cwd) {
  const packageJson = JSON.parse(
    await readFile(path.join(cwd, 'package.json'), 'utf8')
  )
  const dependencies = packageJson.dependencies || {}
  const KECCAK = 'keccak'

  // keccak ships no binaries for arm64 darwin
  if (KECCAK in dependencies) {
    console.debug(`Rebuilding ${KECCAK} for ${os.platform()}/${os.arch()}...`)
    const keccakPath = resolveDependencyFrom(cwd, KECCAK)
    spawnSync(COREPACK_BIN, [LAVAMOAT_PM, 'exec', 'node-gyp-build'], {
      cwd: keccakPath,
      stdio: 'inherit',
    })
  }
}

/**
 * Install a project's deps via a package manager, run the `setup` script, then
 * execute `lavamoat` on the `index.js` file.
 *
 * @param {string} cwd - Project dir
 * @returns {Promise<void>}
 */
async function setup(cwd) {
  // assume 'install' is the subcommand on any package manager
  await exec(COREPACK_BIN, [LAVAMOAT_PM, 'install'], { cwd })
  await exec(COREPACK_BIN, [LAVAMOAT_PM, 'run', 'setup'], { cwd })

  if (os.platform() === 'darwin' && os.arch() === 'arm64') {
    await setupAppleSilicon(cwd)
  }

  await exec(
    process.execPath,
    [path.join(__dirname, '../src/cli.js'), '-a', 'index.js'],
    {
      cwd,
    }
  )
}

async function main() {
  for (const [key, val] of Object.entries(COREPACK_ENV)) {
    process.env[key] = val
  }

  const dirents = await readdir(PROJECTS_DIR, { withFileTypes: true })

  for (const dirent of dirents) {
    if (dirent.isDirectory()) {
      const cwd = path.join(PROJECTS_DIR, dirent.name)
      const relative = path.relative(process.cwd(), cwd)

      await clean(cwd)
      await setup(cwd)

      console.debug('Initialized "%s" using %s', relative, LAVAMOAT_PM)
    }
  }

  console.debug('Test fixtures prepared successfully')
}

// In ESM, there is no require.main === module equivalent
// Instead, we check if this is the main module being run
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
}
