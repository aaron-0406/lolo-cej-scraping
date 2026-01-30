/**
 * Error Middleware
 *
 * Global error handler for the Express API.
 * Catches unhandled errors and returns structured JSON responses.
 */
import { Request, Response, NextFunction } from "express";
import { logger } from "../../monitoring/logger";

/**
 * Global error handler.
 * Logs the error and returns a structured JSON response.
 */
export function errorMiddleware(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error(
    {
      error: err.message,
      stack: err.stack,
      method: req.method,
      path: req.path,
    },
    "Unhandled API error"
  );

  res.status(500).json({
    error: "Internal Server Error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
}
