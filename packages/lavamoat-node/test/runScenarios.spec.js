import test from 'ava'
import { runScenario } from './util.js'
import { loadScenarios } from 'lavamoat-core/test/scenarios/index.js'
import { runAndTestScenario } from 'lavamoat-core/test/util.js'

test('Run scenarios', async (t) => {
  for await (const scenario of loadScenarios()) {
    if (
      !(
        Object.keys(scenario.context).length === 0 &&
        scenario.context.constructor === Object
      )
    ) {
      continue
    }
    t.log(`Running Node Scenario: ${scenario.name}`)
    await runAndTestScenario(t, scenario, ({ scenario }) =>
      runScenario({ scenario })
    )
  }
})
