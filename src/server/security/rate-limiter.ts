import { AppError } from '../errors/app-error.js'

interface RateLimitBucket {
  failures: number[]
  blockedUntilMs: number
}

export interface SlidingWindowRateLimiterOptions {
  readonly maxFailures: number
  readonly windowMs: number
  readonly blockDurationMs: number
  readonly maxTrackedKeys?: number
}

export class SlidingWindowRateLimiter {
  private readonly buckets = new Map<string, RateLimitBucket>()
  private readonly maxFailures: number
  private readonly windowMs: number
  private readonly blockDurationMs: number
  private readonly maxTrackedKeys: number
  private readonly cleanupTimer: NodeJS.Timeout

  public constructor(options: SlidingWindowRateLimiterOptions) {
    this.maxFailures = options.maxFailures
    this.windowMs = options.windowMs
    this.blockDurationMs = options.blockDurationMs
    this.maxTrackedKeys = options.maxTrackedKeys ?? 5000

    this.cleanupTimer = setInterval(
      () => {
        this.pruneStaleBuckets(Date.now())
      },
      Math.max(options.windowMs, 60_000),
    )
    this.cleanupTimer.unref()
  }

  public assertAllowed(key: string, nowMs = Date.now()): void {
    const bucket = this.buckets.get(key)
    if (!bucket) return

    if (bucket.blockedUntilMs > nowMs) {
      const retrySeconds = Math.ceil((bucket.blockedUntilMs - nowMs) / 1000)
      throw AppError.rateLimited(
        `Terlalu banyak percobaan login gagal. Coba lagi dalam ${retrySeconds} detik.`,
      )
    }
  }

  public recordFailure(key: string, nowMs = Date.now()): void {
    let bucket = this.buckets.get(key)

    if (!bucket) {
      if (this.buckets.size >= this.maxTrackedKeys) {
        this.pruneStaleBuckets(nowMs)
        if (this.buckets.size >= this.maxTrackedKeys) {
          const oldestKey = this.buckets.keys().next().value
          if (oldestKey !== undefined) {
            this.buckets.delete(oldestKey)
          }
        }
      }
      bucket = { failures: [], blockedUntilMs: 0 }
      this.buckets.set(key, bucket)
    }

    const cutoffMs = nowMs - this.windowMs
    bucket.failures = bucket.failures.filter((ts) => ts > cutoffMs)
    bucket.failures.push(nowMs)

    if (bucket.failures.length >= this.maxFailures) {
      bucket.blockedUntilMs = nowMs + this.blockDurationMs
    }
  }

  public reset(key: string): void {
    this.buckets.delete(key)
  }

  public pruneStaleBuckets(nowMs = Date.now()): void {
    const cutoffMs = nowMs - this.windowMs
    for (const [key, bucket] of this.buckets.entries()) {
      const hasRecentFailure = bucket.failures.some((ts) => ts > cutoffMs)
      if (!hasRecentFailure && bucket.blockedUntilMs <= nowMs) {
        this.buckets.delete(key)
      }
    }
  }

  public dispose(): void {
    clearInterval(this.cleanupTimer)
    this.buckets.clear()
  }
}
