// Main entry point using ESM syntax
import esmDefaultFunction, { message } from 'bad-esm-module' // esm-module performs a mock attack

// Use the imported function and message
const result = esmDefaultFunction()
console.log(result)
console.log(`Message: ${message}`)
