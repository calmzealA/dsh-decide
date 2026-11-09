/**
 * Optional pre-execute guard.
 *
 * Registers a `tools/pre-execute` listener that asks the configured decision
 * provider one yes/no question about a shell command. It is disabled by
 * default and fails open unless `guard.onError` says otherwise.
 */

function extractCommand(exec) {
  const args = exec?.arguments
  const pick = bag => (typeof bag?.command === 'string' ? bag.command : undefined)
  if (args && typeof args === 'object') return pick(args)
  if (typeof args === 'string') {
    try {
      return pick(JSON.parse(args))
    } catch {
      return undefined
    }
  }
  return undefined
}

function describe(provider, probability, verdict, command) {
  const p = Number.isFinite(probability) ? probability.toFixed(3) : '?'
  const head = verdict === 'deny'
    ? 'blocked by the decision guard'
    : 'needs human review (decision guard is uncertain)'
  const text = command.length > 200 ? command.slice(0, 200) + '…' : command
  return `${head} · ${provider ?? 'decision model'} · p=${p}\n${text}`
}

export function registerGuard(ctx, getState, runtime) {
  return ctx.on('tools/pre-execute', async (exec, next) => {
    let state
    try {
      state = await getState()
    } catch {
      return next()
    }
    if (state.guard?.enabled !== true) return next()
    if (!Array.isArray(state.guard.tools) || !state.guard.tools.includes(exec?.name)) return next()
    const command = extractCommand(exec)
    if (command === undefined || !command.trim()) return next()

    try {
      const result = await runtime.executeGate(state, ctx, {
        action: command,
        provider: state.guard.provider || undefined,
        low: state.guard.low,
        high: state.guard.high,
        signal: exec.signal,
      })
      if (result.verdict === 'allow') return next()
      const reason = describe(result.providerLabel ?? result.provider, result.probability, result.verdict, command)
      if (result.verdict === 'deny') return { kind: 'deny', reason }
      return { kind: 'ask', reason }
    } catch (error) {
      ctx.logger?.warn?.('dsh-decide: guard unavailable, %s: %s', state.guard.onError === 'deny' ? 'denying' : 'delegating', error?.message ?? String(error))
      if (state.guard.onError === 'deny') {
        return { kind: 'deny', reason: `decision guard unavailable: ${error?.message ?? String(error)}` }
      }
      return next()
    }
  })
}
