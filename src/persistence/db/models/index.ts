/**
 * Database Models Index
 *
 * Imports and initializes the Sequelize models that this scraping service
 * needs to read from and write to. These model definitions MIRROR the
 * models defined in lolo-backend — the backend is the source of truth.
 *
 * Models used by the scraper:
 *
 * READ:
 * - CUSTOMER              → Check isScrapperActive
 * - CUSTOMER_HAS_BANK     → Identify which CHBs to scrape
 * - JUDICIAL_CASE_FILE    → Get case files needing scraping
 * - SCHEDULED_NOTIFICATIONS → Read notification schedules
 * - SCRAPE_SNAPSHOT        → Previous state for change detection
 *
 * WRITE:
 * - JUDICIAL_BINNACLE          → Create/update binnacle records
 * - JUDICIAL_BIN_NOTIFICATION  → Create notification records
 * - JUDICIAL_BIN_FILE          → Create file records
 * - JUDICIAL_CASE_FILE         → Update wasScanned, lastScrapedAt
 * - SCRAPE_SNAPSHOT            → Store scraping state
 * - SCRAPE_CHANGE_LOG          → Record detected changes
 * - SCRAPE_JOB_LOG             → Record job execution history
 *
 * NOTE: Model schemas are defined inline here for operational independence.
 * If the backend schema changes, these must be updated to match.
 */
import { DataTypes, Model, Sequelize } from "sequelize";
import sequelize from "../sequelize";

// ============================================================
// SCRAPE_SNAPSHOT — Stores the latest scraping state per case file
// ============================================================
export class ScrapeSnapshot extends Model {}
ScrapeSnapshot.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: "id_scrape_snapshot",
    },
    caseFileId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      field: "case_file_id",
    },
    contentHash: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: "content_hash",
    },
    binnacleCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "binnacle_count",
    },
    rawData: {
      type: DataTypes.JSON,
      allowNull: true,
      field: "raw_data",
    },
    lastScrapedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "last_scraped_at",
    },
    lastChangedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "last_changed_at",
    },
    scrapeCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: "scrape_count",
    },
    consecutiveNoChange: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: "consecutive_no_change",
    },
    errorCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: "error_count",
    },
    lastError: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "last_error",
    },
    createdAt: {
      type: DataTypes.DATE,
      field: "created_at",
    },
    updatedAt: {
      type: DataTypes.DATE,
      field: "updated_at",
    },
  },
  {
    sequelize,
    tableName: "SCRAPE_SNAPSHOT",
    modelName: "SCRAPE_SNAPSHOT",
    timestamps: true,
  }
);

// ============================================================
// SCRAPE_CHANGE_LOG — Audit trail of detected changes
// ============================================================
export class ScrapeChangeLog extends Model {}
ScrapeChangeLog.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: "id_scrape_change_log",
    },
    caseFileId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "case_file_id",
    },
    customerHasBankId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "customer_has_bank_id",
    },
    changeType: {
      type: DataTypes.ENUM(
        "NEW_BINNACLE",
        "MODIFIED_BINNACLE",
        "REMOVED_BINNACLE",
        "NEW_NOTIFICATION",
        "NEW_FILE"
      ),
      allowNull: false,
      field: "change_type",
    },
    binnacleId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "binnacle_id",
    },
    fieldName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "field_name",
    },
    oldValue: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "old_value",
    },
    newValue: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "new_value",
    },
    detectedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "detected_at",
    },
    notified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: "notified",
    },
    notifiedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "notified_at",
    },
    createdAt: {
      type: DataTypes.DATE,
      field: "created_at",
    },
    updatedAt: {
      type: DataTypes.DATE,
      field: "updated_at",
    },
  },
  {
    sequelize,
    tableName: "SCRAPE_CHANGE_LOG",
    modelName: "SCRAPE_CHANGE_LOG",
    timestamps: true,
    indexes: [
      { fields: ["customer_has_bank_id", "notified", "detected_at"], name: "idx_pending" },
      { fields: ["case_file_id", "detected_at"], name: "idx_case_file" },
    ],
  }
);

// ============================================================
// SCRAPE_JOB_LOG — Job execution history for monitoring
// ============================================================
export class ScrapeJobLog extends Model {}
ScrapeJobLog.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: "id_scrape_job_log",
    },
    caseFileId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "case_file_id",
    },
    customerHasBankId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "customer_has_bank_id",
    },
    jobType: {
      type: DataTypes.ENUM("INITIAL", "MONITOR", "PRIORITY"),
      allowNull: false,
      field: "job_type",
    },
    status: {
      type: DataTypes.ENUM("STARTED", "COMPLETED", "FAILED", "RETRYING"),
      allowNull: false,
      field: "status",
    },
    attempt: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      field: "attempt",
    },
    durationMs: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "duration_ms",
    },
    binnaclesFound: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "binnacles_found",
    },
    changesDetected: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: "changes_detected",
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "error_message",
    },
    errorCode: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: "error_code",
    },
    workerId: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: "worker_id",
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "started_at",
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "completed_at",
    },
    createdAt: {
      type: DataTypes.DATE,
      field: "created_at",
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: "SCRAPE_JOB_LOG",
    modelName: "SCRAPE_JOB_LOG",
    timestamps: false,
    indexes: [
      { fields: ["status", "created_at"], name: "idx_status" },
      { fields: ["case_file_id", "created_at"], name: "idx_case_file_log" },
    ],
  }
);

// ============================================================
// References to existing backend tables (read/write)
// These are minimal model definitions — just enough for queries.
// ============================================================

/** CLIENT — existing backend model (read only, for party name on CEJ form) */
export class Client extends Model {}
Client.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, field: "id_client" },
    name: { type: DataTypes.STRING(200), field: "name" },
    code: { type: DataTypes.STRING(150), field: "code" },
    dniOrRuc: { type: DataTypes.STRING(20), field: "dni_or_ruc" },
    customerHasBankId: { type: DataTypes.INTEGER, field: "customer_has_bank_id_customer_has_bank" },
  },
  { sequelize, tableName: "CLIENT", modelName: "CLIENT", timestamps: false }
);

/** JUDICIAL_CASE_FILE — existing backend model (read + update) */
export class JudicialCaseFile extends Model {}
JudicialCaseFile.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, field: "id_judicial_case_file" },
    numberCaseFile: { type: DataTypes.STRING(150), field: "number_case_file" },
    customerHasBankId: { type: DataTypes.INTEGER, field: "customer_has_bank_id" },
    clientId: { type: DataTypes.INTEGER, field: "client_id_client" },
    isScanValid: { type: DataTypes.BOOLEAN, field: "is_scan_valid" },
    wasScanned: { type: DataTypes.BOOLEAN, field: "was_scanned" },
    isArchived: { type: DataTypes.BOOLEAN, field: "is_archived" },
    processStatus: { type: DataTypes.STRING(150), field: "process_status" },
    lastScrapedAt: { type: DataTypes.DATE, field: "last_scraped_at", allowNull: true },
    hasPendingChanges: { type: DataTypes.BOOLEAN, field: "has_pending_changes", defaultValue: false },
    scrapeEnabled: { type: DataTypes.BOOLEAN, field: "scrape_enabled", defaultValue: true },
    createdAt: { type: DataTypes.DATE, field: "created_at" },
    updatedAt: { type: DataTypes.DATE, field: "updated_at" },
    deletedAt: { type: DataTypes.DATE, field: "deleted_at" },
  },
  {
    sequelize,
    tableName: "JUDICIAL_CASE_FILE",
    modelName: "JUDICIAL_CASE_FILE",
    timestamps: true,
    paranoid: true,
  }
);

/** CUSTOMER — existing backend model (read only) */
export class Customer extends Model {}
Customer.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, field: "id_customer" },
    companyName: { type: DataTypes.STRING(150), field: "company_name" },
    isScrapperActive: { type: DataTypes.BOOLEAN, field: "is_scrapper_active" },
    state: { type: DataTypes.TINYINT, field: "state" },
  },
  { sequelize, tableName: "CUSTOMER", modelName: "CUSTOMER", timestamps: false }
);

/** BANK — existing backend model (read only) */
export class Bank extends Model {}
Bank.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, field: "id_bank" },
    name: { type: DataTypes.STRING(150), field: "name" },
  },
  { sequelize, tableName: "BANK", modelName: "BANK", timestamps: false }
);

/** CUSTOMER_HAS_BANK — existing backend model (read only) */
export class CustomerHasBank extends Model {}
CustomerHasBank.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, field: "id_customer_has_bank" },
    idCustomer: { type: DataTypes.INTEGER, field: "customer_id_customer" },
    idBank: { type: DataTypes.INTEGER, field: "bank_id_bank" },
  },
  { sequelize, tableName: "CUSTOMER_HAS_BANK", modelName: "CUSTOMER_HAS_BANK", timestamps: false }
);

/** SCHEDULED_NOTIFICATIONS — existing backend model (read only) */
export class ScheduledNotifications extends Model {}
ScheduledNotifications.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, field: "id_scheduled_notification" },
    nameNotification: { type: DataTypes.STRING(150), field: "name_notification" },
    hourTimeToNotify: { type: DataTypes.JSON, field: "hour_time_to_notify" },
    logicKey: { type: DataTypes.STRING(150), field: "logic_key" },
    state: { type: DataTypes.BOOLEAN, field: "state" },
    customerHasBankId: { type: DataTypes.INTEGER, field: "customer_has_bank_id_customer_has_bank" },
    daysToNotify: { type: DataTypes.STRING, field: "days_to_notify" },
    frequencyToNotify: { type: DataTypes.INTEGER, field: "frequency_to_notify" },
    createdAt: { type: DataTypes.DATE, field: "created_at" },
    updatedAt: { type: DataTypes.DATE, field: "updated_at" },
    deletedAt: { type: DataTypes.DATE, field: "deleted_at" },
  },
  {
    sequelize,
    tableName: "SCHEDULED_NOTIFICATIONS",
    modelName: "SCHEDULED_NOTIFICATIONS",
    timestamps: true,
    paranoid: true,
  }
);

/** JUDICIAL_BINNACLE — existing backend model (read + write) */
export class JudicialBinnacle extends Model {}
JudicialBinnacle.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, field: "id_judicial_binnacle" },
    binnacleTypeId: { type: DataTypes.INTEGER, field: "type_binnacle_id_type_binnacle" },
    date: { type: DataTypes.DATE, field: "date" },
    judicialBinProceduralStageId: { type: DataTypes.INTEGER, field: "judicial_bin_procedural_stage_id_judicial_bin_procedural_stage" },
    judicialFileCaseId: { type: DataTypes.INTEGER, field: "judicial_file_case_id_judicial_file_case" },
    lastPerformed: { type: DataTypes.TEXT, field: "last_performed" },
    index: { type: DataTypes.INTEGER, field: "index" },
    resolutionDate: { type: DataTypes.DATE, field: "resolution_date" },
    entryDate: { type: DataTypes.DATE, field: "entry_date" },
    notificationType: { type: DataTypes.STRING(200), field: "notification_type" },
    acto: { type: DataTypes.STRING(200), field: "acto" },
    fojas: { type: DataTypes.INTEGER, field: "fojas" },
    folios: { type: DataTypes.INTEGER, field: "folios" },
    provedioDate: { type: DataTypes.DATE, field: "provedio_date" },
    userDescription: { type: DataTypes.STRING(200), field: "user_description" },
    createdBy: { type: DataTypes.INTEGER, field: "created_by" },
    totalTariff: { type: DataTypes.DECIMAL(10, 2), field: "total_tariff", defaultValue: 0 },
    tariffHistory: { type: DataTypes.TEXT, field: "tariff_history", defaultValue: "" },
    customerHasBankId: { type: DataTypes.INTEGER, field: "customer_has_bank_id_customer_has_bank" },
    createdAt: { type: DataTypes.DATE, field: "created_at" },
    updatedAt: { type: DataTypes.DATE, field: "updated_at" },
    deletedAt: { type: DataTypes.DATE, field: "deleted_at" },
  },
  {
    sequelize,
    tableName: "JUDICIAL_BINNACLE",
    modelName: "JUDICIAL_BINNACLE",
    timestamps: true,
    paranoid: true,
  }
);

/** JUDICIAL_BIN_NOTIFICATION — existing backend model (write) */
export class JudicialBinNotification extends Model {}
JudicialBinNotification.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, field: "id_judicial_bin_notification" },
    notificationCode: { type: DataTypes.STRING(200), field: "notification_code" },
    addressee: { type: DataTypes.STRING(200), field: "addressee" },
    shipDate: { type: DataTypes.DATE, field: "ship_date" },
    attachments: { type: DataTypes.STRING(200), field: "attachments" },
    deliveryMethod: { type: DataTypes.STRING(200), field: "delivery_method" },
    resolutionDate: { type: DataTypes.DATE, field: "resolution_date" },
    notificationPrint: { type: DataTypes.DATE, field: "notification_print" },
    sentCentral: { type: DataTypes.DATE, field: "sent_central" },
    centralReceipt: { type: DataTypes.DATE, field: "central_receipt" },
    notificationToRecipientOn: { type: DataTypes.DATE, field: "notification_to_recipient_on" },
    chargeReturnedToCourtOn: { type: DataTypes.DATE, field: "charge_returned_to_court_on" },
    idJudicialBinacle: { type: DataTypes.INTEGER, field: "judicial_binacle_id_judicial_binacle" },
    createdAt: { type: DataTypes.DATE, field: "created_at" },
    updatedAt: { type: DataTypes.DATE, field: "updated_at" },
    deletedAt: { type: DataTypes.DATE, field: "deleted_at" },
  },
  {
    sequelize,
    tableName: "JUDICIAL_BIN_NOTIFICATION",
    modelName: "JUDICIAL_BIN_NOTIFICATION",
    timestamps: true,
    paranoid: true,
  }
);

/** JUDICIAL_BIN_FILE — existing backend model (write) */
export class JudicialBinFile extends Model {}
JudicialBinFile.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, field: "id_judicial_bin_file" },
    judicialBinnacleId: { type: DataTypes.INTEGER, field: "judicial_binnacle_id_judicial_binnacle" },
    size: { type: DataTypes.INTEGER, field: "size" },
    nameOriginAws: { type: DataTypes.STRING, field: "name_origin_aws" },
    originalName: { type: DataTypes.STRING, field: "original_name" },
    customerHasBankId: { type: DataTypes.INTEGER, field: "customer_has_bank_id_customer_has_bank" },
    createdAt: { type: DataTypes.DATE, field: "created_at" },
    updatedAt: { type: DataTypes.DATE, field: "updated_at" },
    deletedAt: { type: DataTypes.DATE, field: "deleted_at" },
  },
  {
    sequelize,
    tableName: "JUDICIAL_BIN_FILE",
    modelName: "JUDICIAL_BIN_FILE",
    timestamps: true,
    paranoid: true,
  }
);

/** JUDICIAL_BIN_TYPE_BINNACLE — lookup table for binnacle types */
export class JudicialBinTypeBinnacle extends Model {}
JudicialBinTypeBinnacle.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, field: "id_judicial_bin_type_binnacle" },
    typeBinnacle: { type: DataTypes.STRING(200), field: "type_binnacle" },
    customerHasBankId: { type: DataTypes.INTEGER, field: "customer_has_bank_id_customer_has_bank" },
    createdAt: { type: DataTypes.DATE, field: "created_at" },
    updatedAt: { type: DataTypes.DATE, field: "updated_at" },
    deletedAt: { type: DataTypes.DATE, field: "deleted_at" },
  },
  {
    sequelize,
    tableName: "JUDICIAL_BIN_TYPE_BINNACLE",
    modelName: "JUDICIAL_BIN_TYPE_BINNACLE",
    timestamps: true,
    paranoid: true,
  }
);

/** JUDICIAL_BIN_PROCEDURAL_STAGE — lookup table for procedural stages */
export class JudicialBinProceduralStage extends Model {}
JudicialBinProceduralStage.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, field: "id_judicial_bin_procedural_stage" },
    proceduralStage: { type: DataTypes.STRING(200), field: "procedural_stage" },
    customerHasBankId: { type: DataTypes.INTEGER, field: "customer_has_bank_id_customer_has_bank" },
    createdAt: { type: DataTypes.DATE, field: "created_at" },
    updatedAt: { type: DataTypes.DATE, field: "updated_at" },
    deletedAt: { type: DataTypes.DATE, field: "deleted_at" },
  },
  {
    sequelize,
    tableName: "JUDICIAL_BIN_PROCEDURAL_STAGE",
    modelName: "JUDICIAL_BIN_PROCEDURAL_STAGE",
    timestamps: true,
    paranoid: true,
  }
);

// ============================================================
// Associations
// ============================================================
CustomerHasBank.belongsTo(Customer, { foreignKey: "idCustomer", as: "customer" });
CustomerHasBank.belongsTo(Bank, { foreignKey: "idBank", as: "bank" });
JudicialCaseFile.belongsTo(CustomerHasBank, { foreignKey: "customerHasBankId", as: "customerHasBank" });
JudicialCaseFile.belongsTo(Client, { foreignKey: "clientId", as: "client" });
ScheduledNotifications.belongsTo(CustomerHasBank, { foreignKey: "customerHasBankId", as: "customerHasBank" });
JudicialBinnacle.belongsTo(JudicialCaseFile, { foreignKey: "judicialFileCaseId", as: "judicialFileCase" });
JudicialBinNotification.belongsTo(JudicialBinnacle, { foreignKey: "idJudicialBinacle", as: "judicialBinnacle" });
JudicialBinFile.belongsTo(JudicialBinnacle, { foreignKey: "judicialBinnacleId", as: "judicialBinnacle" });
ScrapeSnapshot.belongsTo(JudicialCaseFile, { foreignKey: "caseFileId", as: "caseFile" });
ScrapeChangeLog.belongsTo(JudicialCaseFile, { foreignKey: "caseFileId", as: "caseFile" });

export default {
  ScrapeSnapshot,
  ScrapeChangeLog,
  ScrapeJobLog,
  JudicialCaseFile,
  Client,
  Customer,
  Bank,
  CustomerHasBank,
  ScheduledNotifications,
  JudicialBinnacle,
  JudicialBinNotification,
  JudicialBinFile,
  JudicialBinTypeBinnacle,
  JudicialBinProceduralStage,
};
