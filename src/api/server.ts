/**
 * Express API Server
 *
 * Minimal Express server for the scraping service.
 * Exposes job trigger endpoints and monitoring routes.
 */
import express from "express";
import path from "path";
import cors from "cors";
import routes from "./routes";
import { errorMiddleware } from "./middlewares/error.middleware";
import { logger } from "../monitoring/logger";
import config from "../config";

/**
 * Create and configure the Express application.
 */
export function createServer(): express.Application {
  const app = express();

  // CORS
  app.use(cors());

  // Body parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Serve monitoring dashboard
  app.use("/dashboard", express.static(path.join(__dirname, "../../public")));

  // Request logging
  app.use((req, _res, next) => {
    logger.debug({ method: req.method, path: req.path }, "Incoming request");
    next();
  });

  // API routes
  app.use("/api/scraping/v1", routes);

  // Error handler
  app.use(errorMiddleware);

  return app;
}

/**
 * Start the Express server.
 */
export function startServer(): Promise<void> {
  return new Promise((resolve) => {
    const app = createServer();
    app.listen(config.port, () => {
      logger.info(
        { port: config.port, env: config.env },
        "API server started"
      );
      resolve();
    });
  });
}
