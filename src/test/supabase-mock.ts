import { vi } from 'vitest'

/**
 * A minimal stand-in for the Supabase client.
 *
 * Every PostgREST builder in this app is the same shape - `select().eq().order()`
 * or `rpc()` - and terminates in a thenable. This mock reproduces exactly that,
 * so the services under test run unmodified. Declare what each table or RPC
 * returns with `setRows` / `setRpc`, and assert on calls with the vi spies.
 */
export function createSupabaseMock() {
  const rows = new Map<string, unknown>()
  const rpcValues = new Map<string, unknown>()

  function chain(resolve: () => unknown) {
    const builder: Record<string, unknown> = {}
    const passthrough = () => builder
    builder.select = vi.fn(passthrough)
    builder.eq = vi.fn(passthrough)
    builder.neq = vi.fn(passthrough)
    builder.in = vi.fn(passthrough)
    builder.order = vi.fn(passthrough)
    builder.limit = vi.fn(passthrough)
    builder.single = vi.fn(passthrough)
    // Present so a test can assert that a direct table write never happened.
    // The database rejects those; the app is supposed to go through an RPC.
    builder.update = vi.fn(passthrough)
    builder.delete = vi.fn(passthrough)
    builder.then = (onFulfilled: (value: { data: unknown; error: null }) => unknown) =>
      Promise.resolve({ data: resolve(), error: null }).then(onFulfilled)
    return builder
  }

  const from = vi.fn((table: string) => chain(() => rows.get(table) ?? []))

  // The second parameter exists so `rpcCalls` can read back the arguments a
  // service passed; the builder itself ignores them.
  const rpc = vi.fn((name: string, ..._args: unknown[]) => chain(() => rpcValues.get(name)))

  const channel = vi.fn(() => {
    const builder: Record<string, unknown> = {}
    builder.on = vi.fn(() => builder)
    builder.subscribe = vi.fn(() => builder)
    return builder
  })

  return {
    from,
    rpc,
    channel,
    removeChannel: vi.fn(() => Promise.resolve('ok')),
    auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })) },

    setRows(table: string, value: unknown[]) {
      rows.set(table, value)
    },
    setRpc(name: string, value: unknown) {
      rpcValues.set(name, value)
    },
    /** Drop declared data and call history so each test starts from nothing. */
    reset() {
      rows.clear()
      rpcValues.clear()
      vi.clearAllMocks()
    },
    /** Every `rpc(name, args)` call made, in order. */
    rpcCalls(name: string) {
      return rpc.mock.calls.filter((call) => call[0] === name).map((call) => call[1])
    },
  }
}

export type SupabaseMock = ReturnType<typeof createSupabaseMock>
