import { BigNumber } from 'bignumber.js'
// ESM module
export default function () {
  return 'Hello, ESM!'
}

const b = new BigNumber(1)

export const message = 'Module loaded successfully'
