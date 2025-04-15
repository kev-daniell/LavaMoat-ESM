// Main entry point using ESM syntax
import _wire_1 from '@bufbuild/protobuf/wire' // @bufbuild/protobuf/wire import resolve edgecase in kernel.js
import esmDefaultFunction, { message } from 'esm-module'
const a = _wire_1

// Use the imported function and message
const result = esmDefaultFunction()
console.log(result)
console.log(`Message: ${message}`)
