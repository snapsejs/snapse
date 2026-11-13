export class RenderError extends Error {
  readonly cause: unknown
  fallbackRendered = false
  private halted = false

  constructor(cause: unknown, private resetFn: () => void) {
    super('Component render failed')
    this.cause = cause
  }

  reset(): void {
    this.resetFn()
  }

  stopPropagation(): void {
    this.halted = true
  }

  get propagationStopped(): boolean {
    return this.halted
  }
}
