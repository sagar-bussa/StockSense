import type { PostgrestError } from '@supabase/supabase-js'

/**
 * Translate Supabase / Postgres failures into messages a warehouse worker can
 * act on.
 *
 * Postgres error codes are stable, so we map the ones this app can actually
 * produce rather than trying to prettify every possibility. Anything raised by
 * our own `RAISE EXCEPTION` statements passes through its human-readable
 * message unchanged, which is why the RPCs write full sentences.
 */

/** Postgres SQLSTATE codes reachable from this app's schema. */
const PG_CODES: Record<string, string> = {
  // unique_violation
  '23505': 'That value must be unique and is already in use.',
  // foreign_key_violation
  '23503': 'This record is still referenced by other data, so it cannot be changed or removed.',
  // check_violation
  '23514': 'That value is not allowed.',
  // not_null_violation
  '23502': 'A required field is missing.',
  // insufficient_privilege
  '42501': 'You do not have permission to perform this action.',
  // invalid_text_representation (bad uuid / bad number)
  '22P02': 'One of the values entered is not valid.',
  // numeric_value_out_of_range
  '22003': 'That quantity is outside the allowed range.',
  // no_data_found
  'P0002': 'The requested record no longer exists.',
  // raise_exception. Messages written by our own RPCs carry the STOCKSENSE:
  // prefix and are handled above; reaching here means a bare RAISE EXCEPTION,
  // which is always a defect in the SQL rather than something the user did.
  'P0001': 'The server rejected that request. Please try again.',
}

/**
 * Messages from our RPCs are written as user-facing sentences and are always
 * prefixed with this marker so they are never overwritten by a code mapping.
 */
const RAISE_PREFIX = 'STOCKSENSE:'

export class AppError extends Error {
  readonly code?: string
  readonly details?: string

  constructor(message: string, code?: string, details?: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.details = details
  }
}

/** A user has not finished the password-reflow they started. */
export class AuthRedirectError extends Error {
  constructor() {
    super('A password reset link was used. Please set a new password.')
    this.name = 'AuthRedirectError'
  }
}

function isPostgrestError(error: unknown): error is PostgrestError {
  return typeof error === 'object' && error !== null && 'code' in error && 'message' in error
}

/**
 * Convert any thrown value into a user-facing message. Never returns a raw
 * Postgres error string to the UI.
 */
export function friendlyError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof AppError) return error.message
  if (error instanceof Error && error.name === 'AuthRedirectError') return error.message

  if (isPostgrestError(error)) {
    const raw = error.message ?? ''

    // Our own RPC messages win over everything else.
    if (raw.includes(RAISE_PREFIX)) {
      return raw.split(RAISE_PREFIX).pop()!.trim()
    }

    const mapped = PG_CODES[error.code]
    if (mapped) return mapped

    return fallback
  }

  if (error instanceof TypeError && /fetch|network/i.test(error.message)) {
    return 'Could not reach the server. Check your connection and try again.'
  }

  return fallback
}

/**
 * Wrap a `RAISE EXCEPTION 'STOCKSENSE: ...'` from Postgres as a real Error so
 * the rest of the app can treat all failures uniformly.
 */
export function normalizeError(error: unknown, fallback?: string): AppError {
  if (error instanceof AppError) return error
  return new AppError(friendlyError(error, fallback), isPostgrestError(error) ? error.code : undefined)
}
