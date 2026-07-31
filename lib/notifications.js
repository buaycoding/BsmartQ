const nodemailer = require('nodemailer');
const sgMail = require('@sendgrid/mail');

function normalizePhoneNumber(rawValue, defaultCountryCode = '+256') {
  const value = String(rawValue || '').trim();
  if (!value) return '';

  const digitsOnly = value.replace(/[^0-9+]/g, '');
  if (!digitsOnly) return '';

  if (digitsOnly.startsWith('+')) {
    return digitsOnly;
  }

  if (digitsOnly.startsWith('256')) {
    return `+${digitsOnly}`;
  }

  if (digitsOnly.startsWith('0')) {
    return `${defaultCountryCode}${digitsOnly.slice(1)}`;
  }

  if (digitsOnly.startsWith('07')) {
    return `${defaultCountryCode}${digitsOnly.slice(1)}`;
  }

  if (/^\d{9,10}$/.test(digitsOnly)) {
    return `${defaultCountryCode}${digitsOnly}`;
  }

  return digitsOnly;
}

async function sendEmailNotification({ to, subject, text, html }) {
  const recipients = Array.isArray(to) ? to : [to];
  const normalizedRecipients = recipients
    .filter(Boolean)
    .map((item) => String(item).trim())
    .filter(Boolean);

  if (!normalizedRecipients.length) {
    return { ok: false, reason: 'Missing recipient' };
  }

  const fromAddress = process.env.SENDGRID_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@bsmartq.app';

  if (process.env.SENDGRID_API_KEY) {
    try {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      await sgMail.send({
        to: normalizedRecipients,
        from: fromAddress,
        subject,
        text,
        html: html || text,
      });
      return { ok: true, provider: 'sendgrid' };
    } catch (error) {
      console.warn(`[email] SendGrid delivery failed for ${normalizedRecipients.join(', ')}: ${error.message}`);
    }
  }

  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log(`[email] No email provider configured for ${normalizedRecipients.join(', ')}. Subject: ${subject}`);
    return { ok: false, reason: 'No email provider configured' };
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || smtpUser,
    to: normalizedRecipients.join(','),
    subject,
    text,
    html: html || text,
  });

  return { ok: true, provider: 'smtp' };
}

async function sendSmsNotification({ twilioClient, to, body, from }) {
  const normalizedNumber = normalizePhoneNumber(to);
  if (!normalizedNumber) {
    return { ok: false, reason: 'Missing phone number' };
  }

  if (!twilioClient || !from) {
    console.log(`[sms] Twilio not configured for ${normalizedNumber}: ${body}`);
    return { ok: false, reason: 'Twilio not configured' };
  }

  await twilioClient.messages.create({
    from,
    to: normalizedNumber,
    body,
  });

  return { ok: true, to: normalizedNumber };
}

module.exports = {
  normalizePhoneNumber,
  sendEmailNotification,
  sendSmsNotification,
};
