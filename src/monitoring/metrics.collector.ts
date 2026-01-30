/**
 * Metrics Collector
 *
 * Collects and exposes Prometheus-compatible metrics via GET /api/scraping/v1/metrics.
 * Tracks: job counts by status/type, job duration histogram, CAPTCHA solve rates,
 * browser pool utilization, and change detection counts.
 *
 * Uses simple in-memory counters. For production at scale, replace with
 * prom-client library for proper histogram support.
 */

interface MetricCounters {
  [key: string]: number;
}

class MetricsCollector {
  private counters: MetricCounters = {};
  private durations: number[] = [];
  private maxDurationSamples = 1000;

  /** Increment a counter metric */
  increment(name: string, labels: Record<string, string> = {}): void {
    const key = this.buildKey(name, labels);
    this.counters[key] = (this.counters[key] || 0) + 1;
  }

  /** Record a job duration for histogram */
  recordDuration(durationSeconds: number): void {
    this.durations.push(durationSeconds);
    // Keep only the last N samples to bound memory
    if (this.durations.length > this.maxDurationSamples) {
      this.durations = this.durations.slice(-this.maxDurationSamples);
    }
  }

  /**
   * Format all metrics as Prometheus text exposition format.
   * This string is returned by the /metrics endpoint.
   */
  format(): string {
    const lines: string[] = [];

    // Counter metrics
    lines.push("# HELP scrape_jobs_total Total scrape jobs processed");
    lines.push("# TYPE scrape_jobs_total counter");
    for (const [key, value] of Object.entries(this.counters)) {
      if (key.startsWith("scrape_jobs_total")) {
        lines.push(`${key} ${value}`);
      }
    }

    lines.push("");
    lines.push("# HELP captcha_solve_total CAPTCHA solve attempts");
    lines.push("# TYPE captcha_solve_total counter");
    for (const [key, value] of Object.entries(this.counters)) {
      if (key.startsWith("captcha_solve_total")) {
        lines.push(`${key} ${value}`);
      }
    }

    lines.push("");
    lines.push("# HELP changes_detected_total Changes detected in scraping");
    lines.push("# TYPE changes_detected_total counter");
    for (const [key, value] of Object.entries(this.counters)) {
      if (key.startsWith("changes_detected_total")) {
        lines.push(`${key} ${value}`);
      }
    }

    // Duration histogram buckets
    lines.push("");
    lines.push("# HELP scrape_job_duration_seconds Scrape job duration");
    lines.push("# TYPE scrape_job_duration_seconds histogram");
    const buckets = [5, 10, 30, 60, 120];
    for (const le of buckets) {
      const count = this.durations.filter((d) => d <= le).length;
      lines.push(`scrape_job_duration_seconds_bucket{le="${le}"} ${count}`);
    }
    lines.push(
      `scrape_job_duration_seconds_bucket{le="+Inf"} ${this.durations.length}`
    );
    lines.push(`scrape_job_duration_seconds_count ${this.durations.length}`);
    const sum = this.durations.reduce((a, b) => a + b, 0);
    lines.push(`scrape_job_duration_seconds_sum ${sum.toFixed(2)}`);

    return lines.join("\n");
  }

  private buildKey(name: string, labels: Record<string, string>): string {
    if (Object.keys(labels).length === 0) return name;
    const labelStr = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(",");
    return `${name}{${labelStr}}`;
  }
}

/** Singleton metrics collector instance */
export const metrics = new MetricsCollector();
