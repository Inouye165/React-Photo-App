import twilio from 'twilio';

const logger = require('../logger');

const REQUIRED_ENV_VARS = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_FROM_NUMBER',
  'ADMIN_PHONE_NUMBER'
] as const;

export async function sendAdminAlert(message: string): Promise<void> {
  const missingVars = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

  if (missingVars.length > 0) {
    logger.warn('[sms] Twilio configuration missing; skipping SMS send', {
      missing: missingVars
    });
    return;
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID as string;
  const authToken = process.env.TWILIO_AUTH_TOKEN as string;
  const fromNumber = process.env.TWILIO_FROM_NUMBER as string;
  const adminNumber = process.env.ADMIN_PHONE_NUMBER as string;

  try {
    const client = twilio(accountSid, authToken);
    await client.messages.create({
      from: fromNumber,
      to: adminNumber,
      body: message
    });
  } catch (error) {
    logger.warn('[sms] Failed to send admin alert', {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
