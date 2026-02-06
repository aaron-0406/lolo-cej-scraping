/**
 * Environment Configuration
 *
 * Centralizes all environment variables into a typed configuration object.
 * All modules import config from here instead of reading process.env directly.
 *
 * Groups:
 * - Server: Express API settings
 * - Database: MySQL connection (shared with lolo-backend)
 * - Redis: BullMQ queue backend
 * - AWS: S3 file storage credentials
 * - Captcha: CapSolver API key for CAPTCHA solving
 * - CEJ: Target website configuration
 * - Worker: Browser pool and concurrency settings
 * - RateLimit: CEJ request throttling
 * - Scheduler: Batch planning interval
 * - Auth: Service-to-service authentication
 */
import dotenv from "dotenv";

dotenv.config();

const config = {
  // --- Server ---
  env: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "4000", 10),
  logLevel: process.env.LOG_LEVEL || "info",

  // --- Database (shared MySQL with lolo-backend) ---
  dbUser: process.env.DB_USER || "root",
  dbPassword: process.env.DB_PASSWORD || "",
  dbHost: process.env.DB_HOST || "localhost",
  dbPort: process.env.DB_PORT || "3306",
  dbName: process.env.DB_NAME || "db_lolo",

  // --- Redis (BullMQ job queues) ---
  redisHost: process.env.REDIS_HOST || "localhost",
  redisPort: parseInt(process.env.REDIS_PORT || "6379", 10),
  redisPassword: process.env.REDIS_PASSWORD || undefined,

  // --- AWS S3 ---
  awsBucketName: process.env.AWS_BUCKET_NAME || "archivosstorage",
  awsBucketRegion: process.env.AWS_BUCKET_REGION || "us-west-2",
  awsPublicKey: process.env.AWS_PUBLIC_KEY || "",
  awsSecretKey: process.env.AWS_SECRET_KEY || "",
  awsChbPath: process.env.AWS_CHB_PATH || "CHB/",

  // --- CapSolver ---
  captchaApiKey: process.env.CAPTCHA_API_KEY || "",

  // --- 2Captcha (fallback for hCaptcha) ---
  twoCaptchaApiKey: process.env.TWO_CAPTCHA_API_KEY || "",

  // --- CEJ Website ---
  cejBaseUrl:
    process.env.CEJ_BASE_URL ||
    "https://cej.pj.gob.pe/cej/forms/busquedaform.html",

  // --- Worker Configuration ---
  browserPoolSize: parseInt(process.env.BROWSER_POOL_SIZE || "3", 10),
  maxPagesPerBrowser: parseInt(process.env.MAX_PAGES_PER_BROWSER || "20", 10),
  workerConcurrency: parseInt(process.env.WORKER_CONCURRENCY || "3", 10),
  pageTimeoutMs: parseInt(process.env.PAGE_TIMEOUT_MS || "30000", 10),
  navigationTimeoutMs: parseInt(
    process.env.NAVIGATION_TIMEOUT_MS || "15000",
    10
  ),

  // --- Rate Limiting ---
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || "10", 10),
  rateLimitDurationMs: parseInt(
    process.env.RATE_LIMIT_DURATION_MS || "60000",
    10
  ),

  // --- Scheduler ---
  schedulerIntervalMinutes: parseInt(
    process.env.SCHEDULER_INTERVAL_MINUTES || "10",
    10
  ),

  // --- Service Authentication ---
  serviceSecret: process.env.SERVICE_SECRET || "change-this-to-a-strong-secret",
};

export default config;
