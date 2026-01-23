import twilio from 'twilio';

const logger = require('../logger');

const REQUIRED_ENV_VARS = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_FROM_NUMBER',
  'ADMIN_PHONE_NUMBER'
] as const;

function maskPhone(value: string): string {
  if (!value) return 'unknown';
  const trimmed = value.trim();
  if (trimmed.length <= 4) return '****';
  return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
}

function previewMessage(value: string): string {
  if (!value) return '';
  return value.length > 120 ? `${value.slice(0, 120)}…` : value;
}

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
    logger.info('[sms] Sending admin alert', {
      from: maskPhone(fromNumber),
      to: maskPhone(adminNumber),
      bodyPreview: previewMessage(message),
      bodyLength: message.length
    });

    const result = await client.messages.create({
      from: fromNumber,
      to: adminNumber,
      body: message
    });

    logger.info('[sms] Admin alert sent', {
      sid: result?.sid,
      status: result?.status,
      to: maskPhone(result?.to || adminNumber),
      from: maskPhone(result?.from || fromNumber)
    });
  } catch (error) {
    const err = error as { message?: string; code?: number; status?: number; moreInfo?: string };
    logger.warn('[sms] Failed to send admin alert', {
      message: err?.message || String(error),
      code: err?.code,
      status: err?.status,
      moreInfo: err?.moreInfo
    });
  }
}
