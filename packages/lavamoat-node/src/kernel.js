/* eslint no-eval: 0 */
import { getPackageNameForModulePath } from '@lavamoat/aa'
import { sanitize } from 'htmlescape'
import {
  applySourceTransforms,
  generateKernel,
  makeInitStatsHook,
} from 'lavamoat-core'
import * as fs from 'node:fs'
import * as module from 'node:module'
import * as path from 'node:path'
import * as url from 'node:url'
import resolve from 'resolve'
import { createFreshRealmCompartment } from './freshRealmCompartment.js'
import { resolutionOmittedExtensions } from './parseForPolicy.js'
import { checkForResolutionOverride } from './resolutions.js'

const { pathToFileURL } = url
const { builtinModules } = module

const noop = () => {}

// In ESM, we don't have globalThis.require
// So we create a wrapper around the native require
const _require = typeof require !== 'undefined' ? require : undefined

// Import required built-in modules directly to avoid ESM/CJS compatibility issues
import * as buffer from 'node:buffer'
import * as child_process from 'node:child_process'
import * as crypto from 'node:crypto'
import * as events from 'node:events'
import * as os from 'node:os'
import * as stream from 'node:stream'
import * as util from 'node:util'
import * as zlib from 'node:zlib'

// Simple require function that works in both ESM and CJS environments
const nativeRequire = (specifier) => {
  // Use global require if available (CJS mode)
  if (_require) {
    return _require(specifier)
  }

  // For ESM context, we need to handle built-in modules specially
  // Handle common built-ins directly to ensure methods work properly
  // Strip node: prefix if present
  const cleanSpecifier = specifier.startsWith('node:')
    ? specifier.substring(5)
    : specifier

  switch (cleanSpecifier) {
    case 'fs':
      return fs
    case 'path':
      return path
    case 'crypto':
      return crypto
    case 'stream':
      return stream
    case 'buffer':
      return buffer
    case 'events':
      return events
    case 'util':
      return util
    case 'os':
      return os
    case 'child_process':
      return child_process
    case 'zlib':
      return zlib
    case 'url':
      return url
    case 'module':
      return module
  }

  // For other built-ins or files, use dynamic import
  return Promise.resolve().then(async () => {
    try {
      // For built-in modules, ensure we're using the node: prefix
      if (
        builtinModules.includes(specifier) ||
        (specifier.startsWith('node:') &&
          builtinModules.includes(specifier.substring(5)))
      ) {
        const nodeSpecifier = specifier.startsWith('node:')
          ? specifier
          : `node:${specifier}`
        return await import(nodeSpecifier)
      }

      // For regular files, use file URLs
      return await import(pathToFileURL(specifier).href)
    } catch (err) {
      throw new Error(`Failed to import module "${specifier}": ${err.message}`)
    }
  })
}

// Helper function to detect if a module is ESM
function isESMModule(specifier) {
  try {
    if (specifier.endsWith('.mjs')) return true

    // Check package.json for "type": "module"
    const packagePath = resolve.sync('package.json', {
      basedir: path.dirname(specifier),
      paths: [path.dirname(specifier)],
    })

    if (packagePath) {
      const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
      return pkg.type === 'module'
    }

    return false
  } catch (err) {
    return false
  }
}

export { createKernel, runESMWithKernel }

async function runESMWithKernel({
  projectRoot,
  entryId,
  lavamoatPolicy,
  canonicalNameMap,
  debugMode,
  statsMode,
  scuttleGlobalThis,
  scuttleGlobalThisExceptions,
}) {
  // Create a kernel with the same settings as for CJS modules
  const kernel = createKernel({
    projectRoot,
    lavamoatPolicy,
    canonicalNameMap,
    debugMode,
    statsMode,
    scuttleGlobalThis,
    scuttleGlobalThisExceptions,
    // Special flag to indicate we're running for ESM
    isESM: true,
  })

  // For ESM files, we need to:
  // 1. Take the sessionizing steps from the kernel
  // 2. Then use dynamic import to load the file in the locked down environment
  try {
    console.warn(
      `LavaMoat ESM - loading "${entryId}" in secured environment...`
    )
    // Import the module in a secured environment
    const moduleSpecifier = pathToFileURL(entryId).href
    await import(moduleSpecifier)
  } catch (err) {
    console.error(
      `LavaMoat ESM - Error executing ESM module "${entryId}": ${err.message}`
    )
    throw err
  }

  return kernel
}

function createKernel({
  projectRoot,
  lavamoatPolicy,
  canonicalNameMap,
  debugMode,
  statsMode,
  scuttleGlobalThis,
  scuttleGlobalThisExceptions,
}) {
  if (scuttleGlobalThisExceptions) {
    console.warn(
      'Lavamoat - "scuttleGlobalThisExceptions" is deprecated. Use "scuttleGlobalThis.exceptions" instead.'
    )
    if (scuttleGlobalThis === true) {
      scuttleGlobalThis = { enabled: true }
    }
    scuttleGlobalThis = Object.assign({}, scuttleGlobalThis)
    scuttleGlobalThis.exceptions =
      scuttleGlobalThis?.exceptions || scuttleGlobalThisExceptions
  }

  const { resolutions } = lavamoatPolicy
  const getRelativeModuleId = createModuleResolver({
    projectRoot,
    resolutions,
    canonicalNameMap,
  })
  const loadModuleData = createModuleLoader({ canonicalNameMap })
  const kernelSrc = generateKernel({ debugMode, scuttleGlobalThis })
  const createKernel = evaluateWithSourceUrl('LavaMoat/node/kernel', kernelSrc)
  const reportStatsHook = statsMode ? makeInitStatsHook({ onStatsReady }) : noop
  const kernel = createKernel({
    lavamoatConfig: lavamoatPolicy,
    loadModuleData,
    getRelativeModuleId,
    prepareModuleInitializerArgs,
    getExternalCompartment,
    globalThisRefs: ['global', 'globalThis'],
    reportStatsHook,
  })
  return kernel
}

function getExternalCompartment(packageName, packagePolicy) {
  const envPolicy = packagePolicy.env
  if (packagePolicy.env === 'unfrozen') {
    return createFreshRealmCompartment()
  }
  throw new Error(
    `LavaMoat/node - unrecognized "env" policy setting for package "${packageName}", "${envPolicy}"`
  )
}

function prepareModuleInitializerArgs(
  requireRelativeWithContext,
  moduleObj,
  moduleData
) {
  // Traditional CJS handling for all module types
  const require = requireRelativeWithContext
  const module = moduleObj
  const exports = moduleObj.exports
  const __filename = moduleData.file
  const __dirname = path.dirname(__filename)

  // Ensure require.resolve is properly set
  require.resolve = (requestedName) => {
    return resolve.sync(requestedName, { basedir: __dirname })
  }

  // Handle path methods specifically for node-gyp-build and similar packages
  require.path = {
    ...path,
    resolve: path.resolve,
    join: path.join,
    dirname: path.dirname,
    isAbsolute: path.isAbsolute,
    basename: path.basename,
    extname: path.extname,
  }

  return [exports, require, module, __filename, __dirname]
}

function createModuleResolver({ projectRoot, resolutions, canonicalNameMap }) {
  return function getRelativeModuleId(parentAbsolutePath, requestedName) {
    // handle resolution overrides
    let parentDir = path.dirname(parentAbsolutePath)
    const parentPackageName = getPackageNameForModulePath(
      canonicalNameMap,
      parentDir
    )
    const result = checkForResolutionOverride(
      resolutions,
      parentPackageName,
      requestedName
    )
    if (result) {
      requestedName = result
      // if path is a relative path, it should be relative to the projectRoot
      if (!path.isAbsolute(result)) {
        parentDir = projectRoot
      }
    }
    // resolve normally
    const resolved = resolve.sync(requestedName, {
      basedir: parentDir,
      extensions: resolutionOmittedExtensions,
    })
    return resolved
  }
}

function createModuleLoader({ canonicalNameMap }) {
  return function loadModuleData(absolutePath) {
    // load builtin modules (eg "fs")
    if (resolve.isCore(absolutePath)) {
      return {
        type: 'builtin',
        file: absolutePath,
        package: absolutePath,
        id: absolutePath,
        // wrapper around unprotected "require" or import
        moduleInitializer: (exports, require, module) => {
          try {
            // Use native require function - handles both CJS and ESM contexts
            const result = nativeRequire(absolutePath)

            // If the result is a promise (in ESM context), we need to handle it differently
            if (result && typeof result.then === 'function') {
              // We return immediately to avoid blocking, and the promise resolution
              // will update module.exports later
              result
                .then((resolvedModule) => {
                  // Handle both default export and named exports
                  if (resolvedModule.default) {
                    // Copy all properties except default
                    Object.keys(resolvedModule).forEach((key) => {
                      if (key !== 'default') {
                        module.exports[key] = resolvedModule[key]
                      }
                    })

                    // For compatibility, make default export available directly
                    if (typeof resolvedModule.default === 'object') {
                      Object.assign(module.exports, resolvedModule.default)
                    } else {
                      module.exports.default = resolvedModule.default
                    }
                  } else {
                    // Just copy all properties for namespace exports
                    Object.assign(module.exports, resolvedModule)
                  }
                })
                .catch((err) => {
                  console.error(
                    `Error loading builtin module ${absolutePath}:`,
                    err
                  )
                  throw err
                })
            } else {
              // Standard synchronous case in CJS context
              module.exports = result
            }
          } catch (error) {
            console.error(
              `Error initializing builtin module ${absolutePath}:`,
              error
            )
            throw error
          }
        },
      }
      // load compiled native module
    } else if (isNativeModule(absolutePath)) {
      const packageName = getPackageNameForModulePath(
        canonicalNameMap,
        absolutePath
      )

      // For node-gyp-build module which is commonly used with native modules
      if (
        absolutePath.includes('node-gyp-build') &&
        absolutePath.endsWith('.js')
      ) {
        return {
          type: 'js',
          file: absolutePath,
          package: packageName,
          source: `(function(exports, require, module, __filename, __dirname){
            // Simplified node-gyp-build implementation for ESM compatibility
            var fs = require('fs');
            var os = require('os');
            
            // Create a fully functional path object
            var path = {
              resolve: function() {
                var args = Array.prototype.slice.call(arguments);
                var result = args.join('/').replace(/\\/\\//g, '/');
                if (args[0] && args[0].startsWith('/')) {
                  return result;
                }
                return __dirname + '/' + result;
              },
              join: function() {
                return Array.prototype.slice.call(arguments).join('/').replace(/\\/\\//g, '/');
              },
              dirname: function(p) {
                return p.split('/').slice(0, -1).join('/') || '.';
              },
              basename: function(p) {
                return p.split('/').pop();
              }
            };
            
            var abi = process.versions.modules;
            var runtime = 'node';
            var arch = os.arch();
            var platform = os.platform();
            var libc = 'glibc';
            var armv = arch === 'arm64' ? '8' : '';
            var uv = (process.versions.uv || '').split('.')[0];
            
            function load(dir) {
              return require(load.resolve(dir));
            }
            
            load.resolve = load.path = function(dir) {
              dir = dir || '.';
              
              try {
                var release = getFirst(dir + '/build/Release', matchBuild);
                if (release) return release;
                
                var debug = getFirst(dir + '/build/Debug', matchBuild);
                if (debug) return debug;
              } catch (e) {
                // Ignore errors and continue
              }
              
              var target = [
                'platform=' + platform,
                'arch=' + arch,
                'runtime=' + runtime, 
                'abi=' + abi,
                'uv=' + uv,
                armv ? 'armv=' + armv : '',
                'libc=' + libc,
                'node=' + process.versions.node
              ].filter(Boolean).join(' ');
              
              throw new Error('No native build was found for ' + target + '\\n    loaded from: ' + dir + '\\n');
            };
            
            function readdirSync(dir) {
              try {
                return fs.readdirSync(dir);
              } catch (err) {
                return [];
              }
            }
            
            function getFirst(dir, filter) {
              var files = readdirSync(dir).filter(filter);
              return files[0] && dir + '/' + files[0];
            }
            
            function matchBuild(name) {
              return /\\.node$/.test(name);
            }
            
            module.exports = load;
          })`,
          id: absolutePath,
        }
      }

      return {
        type: 'native',
        file: absolutePath,
        package: packageName,
        id: absolutePath,
        // wrapper around unprotected "require" or import
        moduleInitializer: (exports, require, module) => {
          try {
            // Use native require function - handles both CJS and ESM contexts
            const result = nativeRequire(absolutePath)

            // If the result is a promise (in ESM context), we need to handle it differently
            if (result && typeof result.then === 'function') {
              // We return immediately to avoid blocking, and the promise resolution
              // will update module.exports later
              result
                .then((resolvedModule) => {
                  // Handle both default export and named exports
                  if (resolvedModule.default) {
                    Object.assign(module.exports, resolvedModule)
                    module.exports.default = resolvedModule.default
                  } else {
                    Object.assign(module.exports, resolvedModule)
                  }
                })
                .catch((err) => {
                  console.error(
                    `Error loading native module ${absolutePath}:`,
                    err
                  )
                  throw err
                })
            } else {
              // Standard synchronous case in CJS context
              module.exports = result
            }
          } catch (error) {
            // Special handling for Node.js native addon loading errors
            if (absolutePath.endsWith('.node')) {
              console.error(
                `Error loading native addon ${absolutePath}: ${error.message}`
              )
              // Provide a dummy implementation
              module.exports = {}
            } else {
              throw error
            }
          }
        },
      }
      // load normal user-space module
    } else {
      const moduleContent = fs.readFileSync(absolutePath, 'utf8')
      // apply source transforms
      let transformedContent = moduleContent
      // hash bang
      const contentLines = transformedContent.split('\n')
      if (contentLines[0].startsWith('#!')) {
        transformedContent = contentLines.slice(1).join('\n')
      }

      transformedContent = applySourceTransforms(transformedContent)

      const isJSON = /\.json$/.test(absolutePath)
      // Check if it's an ESM module
      const isESM = absolutePath.endsWith('.mjs') || isESMModule(absolutePath)

      // wrap json modules (borrowed from browserify)
      if (isJSON) {
        const sanitizedString = sanitize(transformedContent)
        try {
          // check json validity
          JSON.parse(sanitizedString)
          transformedContent = 'module.exports=' + sanitizedString
        } catch (err) {
          err.message = `While parsing ${absolutePath}: ${err.message}`
          throw err
        }
      }
      // ses needs to take a fucking chill pill
      if (isJSON) {
        transformedContent = transformedContent
          .split('-import-')
          .join('-imp ort-')
      } else {
        transformedContent = transformedContent
          .split('"babel-plugin-dynamic-import-node')
          .join('"babel-plugin-dynamic-imp" + "ort-node')
          .split('"@babel/plugin-proposal-dynamic-import')
          .join('"@babel/plugin-proposal-dynamic-imp" + "ort')
          .split('// Re-export lib/utils, so that consumers can import')
          .join('// Re-export lib/utils, so that consumers can imp_ort')
          .split('// babel-plugin-dynamic-import')
          .join('// babel-plugin-dynamic-imp ort')
          .split('// eslint-disable-next-line import/no-unresolved')
          .join('// eslint-disable-next-line imp_ort/no-unresolved')
      }

      // security: ensure module path does not inject code
      if (absolutePath.includes('\n')) {
        throw new Error('invalid newline in module source path')
      }

      const packageName = getPackageNameForModulePath(
        canonicalNameMap,
        absolutePath
      )

      // Handle ESM modules differently than CJS
      if (isESM) {
        // For ESM modules, we'll create a special wrapper that uses dynamic import
        // The wrapper needs to convert an ESM module to a CJS-compatible module object
        const wrappedContent = `(function(exports, require, module, __filename, __dirname){
          // Use dynamic import to load the ESM module
          Promise.resolve().then(async () => {
            try {
              // Dynamic import the ESM module
              const moduleURL = "${pathToFileURL(absolutePath).href}";
              const moduleNamespace = await import(moduleURL);
              
              // Transfer all exports to module.exports
              if (moduleNamespace.default) {
                // Handle default export 
                module.exports = moduleNamespace.default;
                
                // Also copy all named exports
                Object.keys(moduleNamespace).forEach(key => {
                  if (key !== 'default') {
                    module.exports[key] = moduleNamespace[key];
                  }
                });
              } else {
                // No default export, copy all named exports
                Object.assign(module.exports, moduleNamespace);
              }
            } catch (err) {
              console.error("Error importing ESM module: " + err);
              throw err;
            }
          });
        })`

        return {
          type: 'js', // Use 'js' type for compatibility with the kernel
          file: absolutePath,
          package: packageName,
          source: wrappedContent,
          id: absolutePath,
        }
      }

      // Traditional CJS module
      const wrappedContent = `(function(exports, require, module, __filename, __dirname){\n${transformedContent}\n})`

      return {
        type: 'js',
        file: absolutePath,
        package: packageName,
        source: wrappedContent,
        id: absolutePath,
      }
    }
  }
}

function isNativeModule(filename) {
  const fileExtension = filename.split('.').pop()
  return fileExtension === 'node'
}

function evaluateWithSourceUrl(filename, content) {
  return eval(`${content}\n//# sourceURL=${filename}`)
}

function onStatsReady(moduleGraphStatsObj) {
  const graphId = Date.now()
  console.warn(
    `completed module graph init "${graphId}" in ${moduleGraphStatsObj.value}ms ("${moduleGraphStatsObj.name}")`
  )
  const statsFilePath = `./lavamoat-flame-${graphId}.json`
  console.warn(`wrote stats file to "${statsFilePath}"`)
  fs.writeFileSync(statsFilePath, JSON.stringify(moduleGraphStatsObj, null, 2))
}
