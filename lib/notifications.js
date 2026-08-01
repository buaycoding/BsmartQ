const nodemailer = require('nodemailer');
const { createEmailService } = require('./emailService');
let sgMail = null;

try {
  sgMail = require('@sendgrid/mail');
} catch (error) {
  sgMail = null;
}

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

const emailService = createEmailService();

function configureEmailService({ dbPool } = {}) {
  emailService.setDbPool(dbPool);
  return emailService;
}

async function sendEmailNotification({ to, subject, text, html, category = 'general', metadata, retries = 2 }) {
  const recipients = Array.isArray(to) ? to : [to];
  const normalizedRecipients = recipients
    .filter(Boolean)
    .map((item) => String(item).trim())
    .filter(Boolean);

  if (!normalizedRecipients.length) {
    return { ok: false, reason: 'Missing recipient' };
  }

  const fromAddress = process.env.SENDGRID_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@bsmartq.app';

  if (process.env.RESEND_API_KEY || process.env.RESEND_FROM) {
    try {
      return emailService.sendEmail({
        to: normalizedRecipients,
        subject,
        text,
        html: html || text,
        category,
        metadata,
        retries,
      });
    } catch (error) {
      console.warn(`[email] Resend delivery failed for ${normalizedRecipients.join(', ')}: ${error.message}`);
    }
  }

  if (process.env.SENDGRID_API_KEY) {
    if (!sgMail) {
      console.warn(`[email] SendGrid API key configured but @sendgrid/mail is not available. Falling back to SMTP or local logging.`);
    } else {
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
  }

  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.warn(`[email] No SMTP provider configured for ${normalizedRecipients.join(', ')}. Subject: ${subject}`);
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

async function sendBookingEmail({ to, customerName, serviceName, bookingTime, reference }) {
  return sendEmailNotification({
    to,
    subject: 'Booking received',
    text: `Hello ${customerName}, your booking for ${serviceName} on ${bookingTime} has been received. Reference: ${reference}.`,
  });
}

async function sendBookingConfirmationEmail({ to, customerName, serviceName, bookingTime, reference }) {
  return emailService.sendBookingConfirmationEmail({
    to,
    customerName,
    serviceName,
    bookingTime,
    reference,
  });
}

async function sendAppointmentReminderEmail({ to, customerName, serviceName, bookingTime, reference }) {
  return emailService.sendAppointmentReminderEmail({
    to,
    customerName,
    serviceName,
    bookingTime,
    reference,
  });
}

async function sendQueueUpdateEmail({ to, customerName, queueNumber, branchName }) {
  return emailService.sendQueueUpdateEmail({
    to,
    customerName,
    queueNumber,
    branchName,
  });
}

async function sendPaymentReceiptEmail({ to, customerName, amountUsd, planName, reference }) {
  return emailService.sendPaymentReceiptEmail({
    to,
    customerName,
    amountUsd,
    planName,
    reference,
  });
}

async function sendPasswordResetEmail({ to, customerName, resetLink }) {
  return emailService.sendPasswordResetEmail({
    to,
    customerName,
    resetLink,
  });
}

async function sendCustomerInvitationEmail({ to, customerName, inviteUrl, workspaceName }) {
  return emailService.sendCustomerInvitationEmail({ to, customerName, inviteUrl, workspaceName });
}

async function sendStaffInvitationEmail({ to, staffName, inviteUrl, workspaceName, temporaryPassword }) {
  return emailService.sendStaffInvitationEmail({ to, staffName, inviteUrl, workspaceName, temporaryPassword });
}

async function sendEmailVerificationEmail({ to, customerName, verifyLink }) {
  return emailService.sendEmailVerificationEmail({ to, customerName, verifyLink });
}

async function sendBookingConfirmationSms({ twilioClient, to, customerName, serviceName, bookingTime, reference }) {
  return sendSmsNotification({
    twilioClient,
    to,
    body: `Hello ${customerName}, your booking for ${serviceName} on ${bookingTime} is confirmed. Reference: ${reference}.`,
    from: process.env.TWILIO_FROM,
  });
}

async function sendAppointmentReminderSms({ twilioClient, to, customerName, serviceName, bookingTime, reference }) {
  return sendSmsNotification({
    twilioClient,
    to,
    body: `Hello ${customerName}, this is a reminder for your ${serviceName} appointment on ${bookingTime}. Reference: ${reference}.`,
    from: process.env.TWILIO_FROM,
  });
}

async function sendPaymentConfirmationSms({ twilioClient, to, customerName, amountUsd, planName, reference }) {
  return sendSmsNotification({
    twilioClient,
    to,
    body: `Hello ${customerName}, your payment of ${amountUsd} USD for the ${planName} plan was confirmed. Reference: ${reference}.`,
    from: process.env.TWILIO_FROM,
  });
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
  sendBookingEmail,
  sendBookingConfirmationEmail,
  sendAppointmentReminderEmail,
  sendQueueUpdateEmail,
  sendPaymentReceiptEmail,
  sendPasswordResetEmail,
  sendCustomerInvitationEmail,
  sendStaffInvitationEmail,
  sendEmailVerificationEmail,
  sendBookingConfirmationSms,
  sendAppointmentReminderSms,
  sendPaymentConfirmationSms,
  sendSmsNotification,
  configureEmailService,
};
