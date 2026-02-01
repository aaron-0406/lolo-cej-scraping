/**
 * Message Repository
 *
 * Creates MESSAGE and MESSAGES_USERS records for scan results.
 * Each scraping scan that detects new binnacles or notifications
 * creates exactly one message per case file.
 */
import { Op } from "sequelize";
import { CustomerUser, CustomerHasBank, Message, MessagesUsers } from "../db/models";
import { logger } from "../../monitoring/logger";

/**
 * Find the BOT user for a given customer-has-bank.
 * BOT users are identified by DNI pattern '0000000%' (e.g., 00000001, 00000002).
 */
export async function findBotUser(customerHasBankId: number): Promise<CustomerUser | null> {
  const chb = await CustomerHasBank.findByPk(customerHasBankId);
  if (!chb) {
    logger.warn({ customerHasBankId }, "CHB not found when looking up BOT user");
    return null;
  }

  const customerId = chb.get("idCustomer") as number;

  const botUser = await CustomerUser.findOne({
    where: {
      customerId,
      dni: { [Op.like]: "0000000%" },
    },
  });

  if (!botUser) {
    logger.warn({ customerId, customerHasBankId }, "No BOT user found for customer");
    return null;
  }

  logger.debug(
    { botUserId: botUser.get("id"), customerId, customerHasBankId },
    "BOT user resolved"
  );

  return botUser;
}

/**
 * Create a MESSAGE record and a corresponding MESSAGES_USERS record
 * for a scan result.
 */
export async function createScanMessage(data: {
  customerUserId: number;
  customerHasBankId: number;
  caseFileId: number;
  subject: string;
  body: string;
  keyMessage: string;
}): Promise<void> {
  const message = await Message.create({
    customerUserId: data.customerUserId,
    subject: data.subject,
    body: data.body,
    wasRead: false,
    customerHasBankId: data.customerHasBankId,
    keyMessage: data.keyMessage,
  });

  const messageId = message.get("id") as number;

  await MessagesUsers.create({
    messageId,
    customerUserId: data.customerUserId,
    customerHasBankId: data.customerHasBankId,
  });

  logger.info(
    {
      messageId,
      caseFileId: data.caseFileId,
      customerHasBankId: data.customerHasBankId,
      keyMessage: data.keyMessage,
    },
    "Scan message created"
  );
}
