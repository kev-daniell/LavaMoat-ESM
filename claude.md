# LavaMoat Refactor

## Goal

Modify `lavamoat-node` to support ESM (ECMAScript Modules) in addition to its current CommonJS (CJS) context. This will enable `lavamoat-node` to work seamlessly with projects that use ESM, addressing compatibility issues while maintaining its core functionality.

---

## Design Specification: Modify LavaMoat-Node to Support ESM

### Objective

Refactor `lavamoat-node` to support ESM (ECMAScript Modules) in addition to its current CommonJS (CJS) context. This will enable `lavamoat-node` to work seamlessly with projects that use ESM, addressing compatibility issues.

---

### Key Changes

1. **Module Loading Mechanism**

   - Adapt the module loading mechanism in `lavamoat-node` to support ESM.
   - Use Node.js's native `import()` function or `vm.Module` for ESM execution.
   - Ensure compatibility with dynamic imports (`import()`), top-level `await`, and ESM-specific syntax.

2. **Policy File Updates**

   - Update the policy generation and enforcement logic to handle ESM imports and exports.
   - Ensure that ESM dependencies are correctly resolved and validated against the policy.

3. **Runtime Context**

   - Modify the runtime to create isolated ESM contexts using `vm.Module` or similar APIs.
   - Ensure that both CJS and ESM modules can coexist in the same `lavamoat-node` environment.

4. **Backward Compatibility**

   - Maintain support for existing CJS-based projects.
   - Provide a fallback mechanism to handle mixed CJS/ESM projects.

5. **Error Handling**

   - Implement clear error messages for unsupported ESM features or policy violations.
   - Ensure that errors are consistent with the style of `lavamoat-node`.

---

### Implementation Steps

1. **Create ESM Tests and Fixtures**

   - Add new test projects (fixtures) that are ESM-based to the `lavamoat-node` test suite.
   - These tests should evaluate whether `lavamoat-node` works in ESM environments.
   - Ensure the tests are robust, follow the style of existing tests in `lavamoat-node`, and do not cheat.
   - These tests must not be deleted at any time and will serve as the benchmark for determining if the goal has been achieved.

2. **Analyze `lavamoat-node` Codebase**

   - Study the module loading and execution logic in `lavamoat-node`.
   - Understand how policies are generated and enforced in `lavamoat-node`.

3. **Make Necessary Changes**

   - Modify `lavamoat-node` to support ESM by adapting its module loading mechanism.
   - Update any other parts of the monorepo as needed to ensure compatibility with ESM.
   - Ensure that `lavamoat-node` can handle mixed CJS and ESM projects.

4. **Run Tests**

   - Run the existing tests and the new ESM tests to verify that `lavamoat-node` works as expected.
   - Ensure all tests pass without errors.

5. **Documentation**

   - Update the documentation for `lavamoat-node` to include instructions for using it with ESM projects.
   - Provide examples of ESM policies and usage.

---

### Tests

**Note:**

- All tests must pass and should not be deleted. These tests ensure that the refactor is successful and that `lavamoat-node` works as expected with ESM.
- Tests should include both regression tests for existing functionality and new tests for ESM support.

#### 1. Basic ESM Module Loading

Test that `lavamoat-node` can load and execute a simple ESM module.

{code}
import assert from 'assert';

const esmModule = await import('./fixtures/esm-module.js');
assert.strictEqual(esmModule.default(), 'Hello, ESM!');
{code}

#### 2. ESM Policy Enforcement

Test that `lavamoat-node` enforces policies for ESM imports.

{code}
import assert from 'assert';
import { runWithPolicy } from 'lavamoat-node';

const policy = {
resources: {
'esm-module.js': {
imports: ['allowed-module.js'],
},
},
};

assert.doesNotThrow(() => runWithPolicy('./fixtures/esm-module.js', policy));
assert.throws(
() => runWithPolicy('./fixtures/esm-module.js', {}),
/Policy violation/
);
{code}

#### 3. Mixed CJS and ESM

Test that `lavamoat-node` can handle projects with both CJS and ESM modules.

{code}
import assert from 'assert';
import { runWithPolicy } from 'lavamoat-node';

const policy = {
resources: {
'esm-module.js': {
imports: ['cjs-module.js'],
},
'cjs-module.js': {
imports: [],
},
},
};

assert.doesNotThrow(() => runWithPolicy('./fixtures/esm-module.js', policy));
{code}

#### 4. Dynamic Imports

Test that `lavamoat-node` supports dynamic imports in ESM modules.

{code}
import assert from 'assert';

const esmModule = await import('./fixtures/esm-dynamic-import.js');
assert.strictEqual(await esmModule.dynamicImport(), 'Dynamic Import Success!');
{code}

#### 5. Top-Level Await

Test that `lavamoat-node` supports top-level `await` in ESM modules.

{code}
import assert from 'assert';

const esmModule = await import('./fixtures/esm-top-level-await.js');
assert.strictEqual(esmModule.result, 'Top-Level Await Success!');
{code}

---

### Fixtures

#### 1. Basic ESM Module

{code}
export default function () {
return 'Hello, ESM!';
}
{code}

#### 2. Dynamic Import

{code}
// esm-dynamic-import.js
export async function dynamicImport() {
const module = await import('./dynamic-module.js');
return module.message;
}

// dynamic-module.js
export const message = 'Dynamic Import Success!';
{code}

#### 3. Top-Level Await

{code}
export const result = await Promise.resolve('Top-Level Await Success!');
{code}

---

### Expected Outcomes

1. `lavamoat-node` can load and execute ESM modules without errors.
2. Policies are enforced for ESM imports and exports.
3. Mixed CJS and ESM projects work seamlessly.
4. Dynamic imports and top-level `await` are supported.
5. Backward compatibility with CJS projects is maintained.

---

### Order of Tasks

1. Add new ESM tests and fixtures to the `lavamoat-node` test suite.
2. Run all tests to establish a baseline. New ESM tests should fail, old tests should pass.
3. Modify `lavamoat-node` to support ESM.
4. Run all tests again to verify the changes produced the desired results. All tests should pass.
5. Update documentation to reflect ESM support.
6. Ensure all tests pass before considering the task complete.

DO NOT MODIFY OLD TESTS
ENSURE NEW TESTS EFFECTIVELY OUTLINE THE DESIRED GOAL
