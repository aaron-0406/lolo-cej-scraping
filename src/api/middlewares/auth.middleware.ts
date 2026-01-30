/**
 * Auth Middleware
 *
 * Validates service-to-service authentication using a shared secret.
 * lolo-backend includes this secret in requests to the scraping service.
 */
import { Request, Response, NextFunction } from "express";
import config from "../../config";
import { logger } from "../../monitoring/logger";

/**
 * Validate the service secret from the Authorization header.
 * Expected format: Bearer <service-secret>
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    logger.warn(
      { ip: req.ip, path: req.path },
      "Missing or invalid Authorization header"
    );
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.substring(7);

  if (token !== config.serviceSecret) {
    logger.warn(
      { ip: req.ip, path: req.path },
      "Invalid service secret"
    );
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  next();
}
