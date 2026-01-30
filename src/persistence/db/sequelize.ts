/**
 * Sequelize Database Connection
 *
 * Connects to the shared MySQL database (db_lolo) used by lolo-backend.
 * This service writes directly to the database instead of going through
 * the backend API — this avoids HTTP overhead for high-volume writes.
 *
 * IMPORTANT: The scraping service uses the SAME database as lolo-backend.
 * All model definitions must stay consistent with the backend's schema.
 */
import { Sequelize } from "sequelize";
import config from "../../config";
import { logger } from "../../monitoring/logger";

const USER = encodeURIComponent(config.dbUser);
const PASSWORD = encodeURIComponent(config.dbPassword);
const URI = `mysql://${USER}:${PASSWORD}@${config.dbHost}:${config.dbPort}/${config.dbName}`;

const sequelize = new Sequelize(URI, {
  dialect: "mysql",
  // Only log queries in development; production uses structured Pino logs
  logging:
    config.env === "development"
      ? (msg) => logger.debug({ sql: msg }, "SQL Query")
      : false,
  pool: {
    max: 10, // Max connections in pool
    min: 2, // Min connections kept alive
    acquire: 30000, // Max ms to wait for connection
    idle: 10000, // Max ms a connection can be idle
  },
});

export default sequelize;
