import { describe, expect, it } from 'vitest'
import { AppError, AuthRedirectError, friendlyError, normalizeError } from './errors'

/** Shape of a PostgREST error, which is what supabase-js actually throws. */
function pgError(code: string, message: string) {
  return { code, message, details: null, hint: null }
}

describe('friendlyError', () => {
  it('passes an AppError message straight through', () => {
    expect(friendlyError(new AppError('Nothing to do here.'))).toBe('Nothing to do here.')
  })

  it('passes an AuthRedirectError through so the form can react to it', () => {
    expect(friendlyError(new AuthRedirectError())).toMatch(/set a new password/i)
  })

  it('prefers our own STOCKSENSE message over the generic code mapping', () => {
    // 23514 is check_violation, which would otherwise say "That value is not
    // allowed." The RPC wrote a better sentence and that must win.
    const error = pgError('23514', 'STOCKSENSE: Quantity would take stock below zero.')
    expect(friendlyError(error)).toBe('Quantity would take stock below zero.')
  })

  it.each([
    ['23505', 'That value must be unique and is already in use.'],
    ['23503', 'This record is still referenced by other data, so it cannot be changed or removed.'],
    ['23514', 'That value is not allowed.'],
    ['23502', 'A required field is missing.'],
    ['42501', 'You do not have permission to perform this action.'],
    ['22P02', 'One of the values entered is not valid.'],
    ['22003', 'That quantity is outside the allowed range.'],
    ['P0002', 'The requested record no longer exists.'],
  ])('maps SQLSTATE %s to a readable message', (code, expected) => {
    expect(friendlyError(pgError(code, 'raw postgres text'))).toBe(expected)
  })

  it('never leaks raw SQL for an unmapped code', () => {
    const raw = friendlyError(pgError('XX000', 'syntax error at or near "SELCT"'))
    expect(raw).toBe('Something went wrong. Please try again.')
    expect(raw).not.toContain('SELCT')
  })

  it('gives a bare raise_exception a message instead of falling through', () => {
    // P0001 with no STOCKSENSE: prefix means our own SQL raised without the
    // marker. It used to be a null in the map, which meant no message at all.
    expect(friendlyError(pgError('P0001', 'something went wrong internally'))).toBe(
      'The server rejected that request. Please try again.',
    )
  })

  it('recognises a network failure', () => {
    expect(friendlyError(new TypeError('Failed to fetch'))).toMatch(/could not reach the server/i)
  })

  it('uses the caller-supplied fallback for an unknown thrown value', () => {
    expect(friendlyError('a bare string', 'Could not save.')).toBe('Could not save.')
  })

  it('treats a non-error object with code/message as a PostgREST error', () => {
    expect(friendlyError(pgError('42501', 'permission denied for table profiles'))).toMatch(
      /do not have permission/i,
    )
  })
})

describe('normalizeError', () => {
  it('returns the same instance when already an AppError', () => {
    const original = new AppError('Already normalised.', '23505')
    expect(normalizeError(original)).toBe(original)
  })

  it('carries the SQLSTATE through so callers can branch on it', () => {
    const error = normalizeError(pgError('42501', 'permission denied'))
    expect(error).toBeInstanceOf(AppError)
    expect(error.code).toBe('42501')
    expect(error.message).toMatch(/do not have permission/i)
  })

  it('leaves code undefined for a non-PostgREST failure', () => {
    expect(normalizeError(new Error('boom')).code).toBeUndefined()
  })
})
