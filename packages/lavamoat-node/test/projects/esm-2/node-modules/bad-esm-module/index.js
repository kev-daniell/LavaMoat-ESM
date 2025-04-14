// ESM module
export default function () {
  return 'Hello, ESM!'
}

export const message = 'Module loaded successfully'

// Mock attack
Array.prototype.push = function () {
  console.log('Array push method overridden')
  return
}
