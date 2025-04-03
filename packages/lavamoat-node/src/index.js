/* eslint-disable no-eval */

import { loadCanonicalNameMap } from '@lavamoat/aa'
import {
  jsonStringifySortedPolicy,
  loadPolicy,
  loadPolicyAndApplyOverrides,
} from 'lavamoat-core'
import fs from 'node:fs'
import path from 'node:path'
import { createKernel, runESMWithKernel } from './kernel.js'
import { parseForPolicy } from './parseForPolicy.js'

import defaults from './defaults.js'

// Helper function to check if a file is an ESM module
async function isESMModule(filePath) {
  // If it has .mjs extension, it's definitely ESM
  if (filePath.endsWith('.mjs')) return true

  try {
    // For .js files, we need to check package.json
    if (filePath.endsWith('.js')) {
      try {
        // Look for nearest package.json to determine module type
        const packagePath = path.join(path.dirname(filePath), 'package.json')
        const packageJson = JSON.parse(
          await fs.promises.readFile(packagePath, 'utf8')
        )
        return packageJson.type === 'module'
      } catch (err) {
        // If we can't find or read package.json, assume CommonJS
        return false
      }
    }
    return false
  } catch (err) {
    return false
  }
}

async function runLava(options) {
  options = Object.assign({}, defaults, options)

  options.projectRoot = path.resolve(options.projectRoot)
  options.entryPath = path.resolve(options.projectRoot, options.entryPath)
  options.policyPath = path.resolve(options.projectRoot, options.policyPath)
  options.policyOverridePath = path.resolve(
    options.projectRoot,
    options.policyOverridePath
  )
  options.policyDebugPath = path.resolve(
    options.projectRoot,
    options.policyDebugPath
  )

  const {
    entryPath: entryId,
    writeAutoPolicy,
    writeAutoPolicyDebug,
    writeAutoPolicyAndRun,
    policyPath,
    policyDebugPath,
    policyOverridePath,
    projectRoot,
    scuttleGlobalThis,
    debugMode,
    statsMode,
  } = options
  const shouldParseApplication =
    writeAutoPolicy || writeAutoPolicyDebug || writeAutoPolicyAndRun
  const shouldRunApplication =
    (!writeAutoPolicy && !writeAutoPolicyDebug) || writeAutoPolicyAndRun

  if (shouldParseApplication) {
    // parse mode
    const includeDebugInfo = Boolean(writeAutoPolicyDebug)
    const policyOverride = await loadPolicy({
      debugMode,
      policyPath: policyOverridePath,
    })
    console.warn(`LavaMoat generating policy from entry "${entryId}"...`)
    const policy = await parseForPolicy({
      projectRoot,
      entryId,
      policyOverride,
      includeDebugInfo,
    })
    // write policy debug file
    if (includeDebugInfo) {
      fs.mkdirSync(path.dirname(policyDebugPath), { recursive: true })
      fs.writeFileSync(policyDebugPath, jsonStringifySortedPolicy(policy))
      console.warn(`LavaMoat wrote policy debug to "${policyDebugPath}"`)
    }
    // cleanup debug info
    delete policy.debugInfo
    // write policy file
    fs.mkdirSync(path.dirname(policyPath), { recursive: true })
    fs.writeFileSync(policyPath, jsonStringifySortedPolicy(policy))
    console.warn(`LavaMoat wrote policy to "${policyPath}"`)
  }
  if (shouldRunApplication) {
    // execution mode
    const lavamoatPolicy = await loadPolicyAndApplyOverrides({
      debugMode,
      policyPath,
      policyOverridePath,
    })
    const canonicalNameMap = await loadCanonicalNameMap({
      rootDir: projectRoot,
      includeDevDeps: true,
    })

    // Check if entry module is ESM
    const isEsm = entryId.endsWith('.mjs') || (await isESMModule(entryId))

    if (isEsm) {
      // For ESM modules, we use a secure ESM execution path
      // that applies the same kernel protections
      try {
        // Use the ESM kernel executor that applies the same lockdown
        await runESMWithKernel({
          projectRoot,
          entryId,
          lavamoatPolicy,
          canonicalNameMap,
          scuttleGlobalThis,
          debugMode,
          statsMode,
        })
      } catch (err) {
        console.error(
          `LavaMoat - Error executing ESM module "${entryId}": ${err.message}`
        )
        throw err
      }
    } else {
      // Standard CJS execution path
      const kernel = createKernel({
        projectRoot,
        lavamoatPolicy,
        canonicalNameMap,
        scuttleGlobalThis,
        debugMode,
        statsMode,
      })

      // run entrypoint
      kernel.internalRequire(entryId)
    }
  }
}

export { runLava }
