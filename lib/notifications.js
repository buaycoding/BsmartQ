const nodemailer = require('nodemailer');
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
  return sendEmailNotification({
    to,
    subject: 'Booking confirmed',
    text: `Hello ${customerName}, your booking for ${serviceName} on ${bookingTime} is confirmed. Reference: ${reference}.`,
  });
}

async function sendAppointmentReminderEmail({ to, customerName, serviceName, bookingTime, reference }) {
  return sendEmailNotification({
    to,
    subject: 'Appointment reminder',
    text: `Hello ${customerName}, this is a reminder for your ${serviceName} appointment on ${bookingTime}. Reference: ${reference}.`,
  });
}

async function sendQueueUpdateEmail({ to, customerName, queueNumber, branchName }) {
  return sendEmailNotification({
    to,
    subject: 'Queue update',
    text: `Hello ${customerName}, your queue update is ready. Your current number is ${queueNumber} at ${branchName}.`,
  });
}

async function sendPaymentReceiptEmail({ to, customerName, amountUsd, planName, reference }) {
  return sendEmailNotification({
    to,
    subject: 'Payment receipt',
    text: `Hello ${customerName}, we received your payment of ${amountUsd} USD for the ${planName} plan. Reference: ${reference}.`,
  });
}

async function sendPasswordResetEmail({ to, customerName, resetLink }) {
  return sendEmailNotification({
    to,
    subject: 'Password reset',
    text: `Hello ${customerName}, use this link to reset your password: ${resetLink}`,
  });
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
  sendBookingConfirmationSms,
  sendAppointmentReminderSms,
  sendPaymentConfirmationSms,
  sendSmsNotification,
};
