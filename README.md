# lolo-cej-scraping

Automated scraping engine for the CEJ (Consulta de Expedientes Judiciales) website. Monitors judicial case files, detects changes, and feeds the notification pipeline.

## Architecture

```
┌─────────────┐     ┌──────────┐     ┌──────────────┐
│ Scheduler    │────>│ BullMQ   │────>│ Workers      │
│ (node-cron)  │     │ (Redis)  │     │ (Puppeteer)  │
└─────────────┘     └──────────┘     └──────┬───────┘
                                            │
                    ┌───────────────────────┐│
                    │ Processing Pipeline   ││
                    │ ┌──────────────────┐  ││
                    │ │ Normalize + Hash │<─┘│
                    │ │ Detect Changes   │   │
                    │ │ Write Changelog  │   │
                    │ └────────┬─────────┘   │
                    └──────────┼─────────────┘
                               │
                    ┌──────────v─────────────┐
                    │ MySQL (shared db_lolo)  │
                    │ + S3 (file uploads)     │
                    └────────────────────────┘
```

## Prerequisites

- Node.js 18+
- Redis 7+ (for BullMQ)
- MySQL 8+ (shared db_lolo database with lolo-backend)
- 2Captcha API key

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your database, Redis, and API credentials

# 3. Run the migration (from lolo-backend)
cd ../lolo-backend
npx sequelize-cli db:migrate

# 4. Start Redis (if not running)
docker run -d -p 6379:6379 redis:7-alpine

# 5. Start the service
npm run dev
```

## Docker

```bash
# Start with Docker Compose (includes Redis)
docker-compose up -d
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/scraping/v1/jobs/initial | Bearer | Trigger initial scrape |
| POST | /api/scraping/v1/jobs/priority | Bearer | Trigger priority re-scrape |
| GET | /api/scraping/v1/status | Bearer | Queue status dashboard |
| GET | /api/scraping/v1/health | Public | Health check |
| GET | /api/scraping/v1/metrics | Public | Prometheus metrics |

## Project Structure

```
src/
├── index.ts                    # Entry point
├── config/                     # Environment config + constants
├── api/                        # Express server + routes
├── scheduler/                  # Cron-based batch planning
├── queue/                      # BullMQ queues + producers
├── workers/                    # Job processors
├── scraping/                   # CEJ navigation + extraction
│   ├── browser/                # Browser pool + stealth
│   ├── captcha/                # CAPTCHA solving strategies
│   ├── navigators/             # Page navigation
│   ├── extractors/             # DOM data extraction
│   └── downloaders/            # File downloads
├── processing/                 # Normalization + change detection
├── persistence/                # Repositories + S3 + DB models
├── monitoring/                 # Logger + metrics + health
└── shared/                     # Types + errors + utilities
```

## Key Concepts

- **Adaptive Frequency**: Stale cases are scraped less often to save resources
- **Change Detection**: SHA-256 hash comparison + structured diff
- **CAPTCHA Strategy Pattern**: Normal -> HCaptcha -> Audio fallback
- **Browser Pooling**: Reusable Puppeteer instances with recycling

## Environment Variables

See `.env.example` for the complete list.
