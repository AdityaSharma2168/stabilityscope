import { logger } from "./logger"

type RouteHandler<TArgs extends unknown[]> = (
  ...args: TArgs
) => Promise<Response> | Response

/**
 * Wrap a Next.js App Router route handler with request timing + structured
 * logging. Emits a single `http_request` log entry with method, path, status,
 * and durationMs once the handler resolves (or rejects). Pass-through
 * signature: works for both static (`(req)`) and dynamic
 * (`(req, { params })`) handlers.
 *
 * Handlers can still call `logger.info(...)` directly to attach
 * domain-specific fields (e.g. userId, ticker) — this wrapper only adds the
 * generic transport-level line.
 */
export function withLogging<TArgs extends unknown[]>(
  handler: RouteHandler<TArgs>,
): (...args: TArgs) => Promise<Response> {
  return async (...args: TArgs): Promise<Response> => {
    const req = args[0] as Request
    const start = Date.now()
    let path = req.url
    try {
      path = new URL(req.url).pathname
    } catch {
      // leave as-is
    }

    let status = 500
    try {
      const response = await handler(...args)
      status = response.status
      return response
    } catch (err) {
      logger.error({
        action: "http_error",
        method: req.method,
        path,
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      })
      throw err
    } finally {
      logger.info({
        action: "http_request",
        method: req.method,
        path,
        status,
        durationMs: Date.now() - start,
      })
    }
  }
}
