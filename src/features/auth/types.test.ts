import { describe, expect, it } from 'vitest'
import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, can, type Role } from './types'

describe('role metadata', () => {
  it('labels and describes every role', () => {
    // A new role added to the enum must not silently fall back to "undefined".
    for (const role of ROLES) {
      expect(ROLE_LABELS[role]).toBeTruthy()
      expect(ROLE_DESCRIPTIONS[role]).toBeTruthy()
    }
  })

  it('covers the database enum exactly', () => {
    // Mirrors app_role in migration 002. If these drift, the UI will offer a
    // role the database rejects.
    expect([...ROLES]).toEqual(['admin', 'inventory_manager', 'warehouse_staff'])
  })
})

describe('can', () => {
  it('lets admins manage the catalogue, warehouses and users', () => {
    expect(can.manageCatalog('admin')).toBe(true)
    expect(can.manageWarehouses('admin')).toBe(true)
    expect(can.manageUsers('admin')).toBe(true)
  })

  it('lets inventory managers run the catalogue but not users or warehouses', () => {
    expect(can.manageCatalog('inventory_manager')).toBe(true)
    expect(can.manageWarehouses('inventory_manager')).toBe(false)
    expect(can.manageUsers('inventory_manager')).toBe(false)
  })

  it('restricts warehouse staff to posting operations', () => {
    const role: Role = 'warehouse_staff'
    expect(can.manageCatalog(role)).toBe(false)
    expect(can.manageWarehouses(role)).toBe(false)
    expect(can.manageUsers(role)).toBe(false)
    expect(can.postOperations(role)).toBe(true)
  })

  it('denies everything privileged while the profile is still unknown', () => {
    // undefined means "not loaded yet". Showing a privileged button that then
    // fails is worse than showing none.
    expect(can.manageCatalog(undefined)).toBe(false)
    expect(can.manageWarehouses(undefined)).toBe(false)
    expect(can.manageUsers(undefined)).toBe(false)
  })
})
