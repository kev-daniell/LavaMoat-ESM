// Main entry point using ESM syntax
import esmDefaultFunction, { message } from 'esm-module'

// Use the imported function and message
const result = esmDefaultFunction()
console.log(result)
console.log(`Message: ${message}`)
