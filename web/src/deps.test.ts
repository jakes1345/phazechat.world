import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/**
 * Regression guard for a real outage.
 *
 * A dependabot PR bumped `react` to 19.2.8 but left `react-dom` on 19.2.7.
 * React 19 refuses to mount when the two disagree, so the deployed app was a
 * blank page. Nothing in the pipeline noticed: `tsc` doesn't check runtime
 * version agreement, vite bundles the mismatch happily, and no existing test
 * mounts React, so the suite stayed green while the product was down.
 *
 * These assert on the *installed* versions (resolved through node_modules)
 * rather than the declared ranges in package.json, because the range is not
 * what ships — the lockfile is.
 */
describe('dependency integrity', () => {
  it('react and react-dom are the exact same version', () => {
    const react = require('react/package.json') as { version: string }
    const reactDom = require('react-dom/package.json') as { version: string }
    expect(
      reactDom.version,
      `react-dom ${reactDom.version} does not match react ${react.version}. ` +
        'React refuses to mount on a mismatch and the app renders a blank page. ' +
        'Bump them together.',
    ).toBe(react.version)
  })

  it('@types/react major track matches the installed react', () => {
    const react = require('react/package.json') as { version: string }
    const types = require('@types/react/package.json') as { version: string }
    expect(types.version.split('.')[0]).toBe(react.version.split('.')[0])
  })
})
