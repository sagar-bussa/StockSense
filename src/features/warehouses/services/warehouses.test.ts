import { describe, expect, it } from 'vitest'
import { scopeIsRedundant } from './warehouses'

describe('scopeIsRedundant', () => {
  it('hides the selector for a user granted every warehouse', () => {
    // A manager can see all three, so a filter cannot change the result.
    expect(scopeIsRedundant(3, 3)).toBe(true)
  })

  it('hides the selector when the user has no explicit grants', () => {
    // Admins and managers get access by role, so warehouse_ids is empty.
    expect(scopeIsRedundant(3, 0)).toBe(true)
  })

  it('shows the selector for staff scoped to some warehouses', () => {
    expect(scopeIsRedundant(3, 1)).toBe(false)
  })

  it('shows the selector even for a single granted warehouse', () => {
    // Staff who can only see one site still benefit from the explicit
    // "All warehouses" label, and the choice survives a later grant change.
    expect(scopeIsRedundant(2, 1)).toBe(false)
  })
})
