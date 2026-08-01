const path = require('path');

let ResendClient = null;
try {
  const resendModule = require('resend');
  ResendClient = resendModule.Resend || resendModule;
} catch (error) {
  ResendClient = null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildBaseTemplate({ title, preheader, greeting, content, actionLabel, actionUrl, footerText }) {
  const safeTitle = escapeHtml(title || 'BsmartQ');
  const safePreheader = escapeHtml(preheader || '');
  const safeGreeting = escapeHtml(greeting || 'Hello');
  const safeContent = content || '';
  const safeActionLabel = escapeHtml(actionLabel || 'Open BsmartQ');
  const safeActionUrl = escapeHtml(actionUrl || 'https://bsmartq.app');
  const safeFooterText = escapeHtml(footerText || 'This message was sent from BsmartQ.');

  return `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeTitle}</title>
    <style>
      body { margin: 0; padding: 0; background: #f5f7fb; font-family: Arial, Helvetica, sans-serif; color: #14213d; }
      .wrapper { width: 100%; background: #f5f7fb; padding: 24px 12px; }
      .card { max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 12px 30px rgba(20, 33, 61, 0.08); }
      .header { padding: 28px 32px 20px; background: linear-gradient(135deg, #2563eb, #0f172a); color: #ffffff; }
      .header h1 { margin: 0; font-size: 24px; }
      .content { padding: 32px; }
      .content p { line-height: 1.7; margin: 0 0 14px; }
      .button { display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 999px; font-weight: 700; margin-top: 8px; }
      .meta { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; margin-top: 18px; }
      .footer { padding: 20px 32px 32px; font-size: 12px; color: #64748b; }
      @media (max-width: 600px) {
        .content, .header, .footer { padding-left: 20px !important; padding-right: 20px !important; }
      }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="card">
        <div class="header">
          <h1>${safeTitle}</h1>
          <p style="margin: 6px 0 0; opacity: 0.9;">${safePreheader}</p>
        </div>
        <div class="content">
          <p><strong>${safeGreeting},</strong></p>
          ${safeContent}
          ${actionUrl ? `<p><a class="button" href="${safeActionUrl}">${safeActionLabel}</a></p>` : ''}
        </div>
        <div class="footer">
          ${safeFooterText}
        </div>
      </div>
    </div>
  </body>
  </html>`;
}

function createEmailService({ dbPool, transport } = {}) {
  let resolvedDbPool = dbPool || null;
  let resendClient = null;

  function getResendClient() {
    if (!process.env.RESEND_API_KEY) {
      return null;
    }

    if (!resendClient && ResendClient) {
      try {
        resendClient = new ResendClient(process.env.RESEND_API_KEY);
      } catch (error) {
        resendClient = null;
      }
    }

    return resendClient;
  }

  async function ensureNotificationsTable() {
    if (!resolvedDbPool) return;

    try {
      await resolvedDbPool.query(`
        CREATE TABLE IF NOT EXISTS notifications (
          id BIGSERIAL PRIMARY KEY,
          recipient TEXT NOT NULL,
          subject TEXT NOT NULL,
          category TEXT NOT NULL DEFAULT 'general',
          provider TEXT,
          status TEXT NOT NULL,
          message_id TEXT,
          provider_message TEXT,
          metadata JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } catch (error) {
      console.warn('Unable to ensure notifications table exists:', error.message);
    }
  }

  async function logNotification({ to, subject, category, provider, status, messageId, providerMessage, metadata }) {
    if (!resolvedDbPool) return;

    try {
      await ensureNotificationsTable();
      const recipientList = Array.isArray(to) ? to.join(', ') : String(to || '');
      await resolvedDbPool.query(
        `INSERT INTO notifications (recipient, subject, category, provider, status, message_id, provider_message, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
        [recipientList, subject, category, provider || 'unknown', status, messageId || null, providerMessage || null, metadata ? JSON.stringify(metadata) : null]
      );
    } catch (error) {
      console.warn('Failed to log email notification:', error.message);
    }
  }

  async function sendEmail({ to, subject, text, html, category = 'general', metadata = {}, retries = 2 }) {
    const recipients = Array.isArray(to) ? to : [to];
    const normalizedRecipients = recipients
      .filter(Boolean)
      .map((item) => String(item).trim())
      .filter(Boolean);

    if (!normalizedRecipients.length) {
      return { ok: false, reason: 'Missing recipient' };
    }

    const fromAddress = process.env.RESEND_FROM || process.env.SMTP_FROM || process.env.SENDGRID_FROM || 'BsmartQ <no-reply@bsmartq.app>';
    const plainText = text || 'BsmartQ notification';
    const htmlContent = html || buildBaseTemplate({
      title: subject || 'BsmartQ notification',
      preheader: 'BsmartQ',
      greeting: 'Hello',
      content: `<p>${escapeHtml(plainText)}</p>`,
      footerText: 'This message was sent from BsmartQ.',
    });

    let lastError = null;
    for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
      try {
        let response;
        const payload = {
          from: fromAddress,
          to: normalizedRecipients,
          subject,
          text: plainText,
          html: htmlContent,
        };

        if (typeof transport === 'function') {
          response = await transport(payload);
        } else if (process.env.RESEND_API_KEY) {
          const client = getResendClient();
          if (!client) {
            throw new Error('Resend client could not be initialized');
          }
          response = await client.emails.send(payload);
        } else {
          throw new Error('No email provider configured');
        }

        const messageId = response?.data?.id || response?.id || null;
        await logNotification({
          to: normalizedRecipients,
          subject,
          category,
          provider: 'resend',
          status: 'sent',
          messageId,
          providerMessage: null,
          metadata,
        });

        return {
          ok: true,
          provider: 'resend',
          messageId,
          attempts: attempt,
          response,
        };
      } catch (error) {
        lastError = error;
        if (attempt <= retries) {
          await delay(1000 * attempt);
        }
      }
    }

    await logNotification({
      to: normalizedRecipients,
      subject,
      category,
      provider: 'resend',
      status: 'failed',
      messageId: null,
      providerMessage: lastError ? lastError.message : 'Unknown error',
      metadata,
    });

    return {
      ok: false,
      reason: lastError ? lastError.message : 'Email send failed',
      attempts: retries + 1,
    };
  }

  async function sendCustomerInvitationEmail({ to, customerName, inviteUrl, workspaceName }) {
    return sendEmail({
      to,
      subject: 'You are invited to BsmartQ',
      text: `Hello ${customerName}, you have been invited to join ${workspaceName || 'the BsmartQ workspace'}.`,
      category: 'customer_invitation',
      metadata: { type: 'customer_invitation', workspaceName: workspaceName || 'BsmartQ' },
      html: buildBaseTemplate({
        title: 'You are invited to BsmartQ',
        preheader: 'Join your workspace and get started',
        greeting: customerName || 'Hello',
        content: `<p>You have been invited to join <strong>${escapeHtml(workspaceName || 'the BsmartQ workspace')}</strong>.</p><p>Use the button below to accept your invitation and access your queue tools.</p>`,
        actionLabel: 'Accept invitation',
        actionUrl: inviteUrl || 'https://bsmartq.app',
        footerText: 'If you did not expect this invitation, you can safely ignore it.',
      }),
    });
  }

  async function sendStaffInvitationEmail({ to, staffName, inviteUrl, workspaceName, temporaryPassword }) {
    return sendEmail({
      to,
      subject: 'Your BsmartQ staff access is ready',
      text: `Hello ${staffName}, your staff access for ${workspaceName || 'BsmartQ'} is ready.`,
      category: 'staff_invitation',
      metadata: { type: 'staff_invitation', workspaceName: workspaceName || 'BsmartQ' },
      html: buildBaseTemplate({
        title: 'Your staff access is ready',
        preheader: 'Set up your account and manage queues',
        greeting: staffName || 'Hello',
        content: `<p>Your account for <strong>${escapeHtml(workspaceName || 'BsmartQ')}</strong> has been created.</p><p>${temporaryPassword ? `Temporary password: <strong>${escapeHtml(temporaryPassword)}</strong>` : 'Use the button below to get started.'}</p>`,
        actionLabel: 'Open dashboard',
        actionUrl: inviteUrl || 'https://bsmartq.app',
        footerText: 'Please keep your temporary credentials secure.',
      }),
    });
  }

  async function sendBookingConfirmationEmail({ to, customerName, serviceName, bookingTime, reference, bookingUrl }) {
    return sendEmail({
      to,
      subject: 'Booking confirmed',
      text: `Hello ${customerName}, your booking for ${serviceName} on ${bookingTime} is confirmed.`,
      category: 'booking_confirmation',
      metadata: { type: 'booking_confirmation', reference },
      html: buildBaseTemplate({
        title: 'Booking confirmed',
        preheader: 'Your appointment is locked in',
        greeting: customerName || 'Hello',
        content: `<p>Your booking for <strong>${escapeHtml(serviceName || 'your selected service')}</strong> is confirmed for <strong>${escapeHtml(bookingTime || 'your preferred time')}</strong>.</p><p>Reference: <strong>${escapeHtml(reference || 'N/A')}</strong></p>`,
        actionLabel: 'View booking',
        actionUrl: bookingUrl || 'https://bsmartq.app',
        footerText: 'Please arrive a few minutes early for a smooth experience.',
      }),
    });
  }

  async function sendPaymentReceiptEmail({ to, customerName, amountUsd, planName, reference, receiptUrl }) {
    return sendEmail({
      to,
      subject: 'Payment receipt',
      text: `Hello ${customerName}, your payment receipt for ${planName} is ready.`,
      category: 'payment_receipt',
      metadata: { type: 'payment_receipt', reference },
      html: buildBaseTemplate({
        title: 'Payment receipt',
        preheader: 'We received your payment',
        greeting: customerName || 'Hello',
        content: `<p>We received your payment of <strong>${escapeHtml(amountUsd || '0')} USD</strong> for <strong>${escapeHtml(planName || 'your plan')}</strong>.</p><p>Reference: <strong>${escapeHtml(reference || 'N/A')}</strong></p>`,
        actionLabel: 'View receipt',
        actionUrl: receiptUrl || 'https://bsmartq.app',
        footerText: 'Thanks for choosing BsmartQ.',
      }),
    });
  }

  async function sendQueueUpdateEmail({ to, customerName, queueNumber, branchName, queueUrl }) {
    return sendEmail({
      to,
      subject: 'Queue update',
      text: `Hello ${customerName}, your queue update is ready.`,
      category: 'queue_update',
      metadata: { type: 'queue_update', queueNumber, branchName },
      html: buildBaseTemplate({
        title: 'Queue update',
        preheader: 'Your number is ready',
        greeting: customerName || 'Hello',
        content: `<p>Your current queue number is <strong>${escapeHtml(queueNumber || 'N/A')}</strong>.</p><p>Branch: <strong>${escapeHtml(branchName || 'Main Branch')}</strong></p>`,
        actionLabel: 'Track status',
        actionUrl: queueUrl || 'https://bsmartq.app',
        footerText: 'We will keep you updated as your turn approaches.',
      }),
    });
  }

  async function sendAppointmentReminderEmail({ to, customerName, serviceName, bookingTime, reference, bookingUrl }) {
    return sendEmail({
      to,
      subject: 'Appointment reminder',
      text: `Hello ${customerName}, this is a reminder for your appointment.`,
      category: 'appointment_reminder',
      metadata: { type: 'appointment_reminder', reference },
      html: buildBaseTemplate({
        title: 'Appointment reminder',
        preheader: 'A quick reminder about your upcoming visit',
        greeting: customerName || 'Hello',
        content: `<p>Your appointment for <strong>${escapeHtml(serviceName || 'your selected service')}</strong> is approaching.</p><p>Time: <strong>${escapeHtml(bookingTime || 'soon')}</strong></p><p>Reference: <strong>${escapeHtml(reference || 'N/A')}</strong></p>`,
        actionLabel: 'View reminder',
        actionUrl: bookingUrl || 'https://bsmartq.app',
        footerText: 'Please arrive a little early if you need assistance.',
      }),
    });
  }

  async function sendPasswordResetEmail({ to, customerName, resetLink }) {
    return sendEmail({
      to,
      subject: 'Reset your password',
      text: `Hello ${customerName}, use this link to reset your password.`,
      category: 'password_reset',
      metadata: { type: 'password_reset' },
      html: buildBaseTemplate({
        title: 'Reset your password',
        preheader: 'You requested a password reset',
        greeting: customerName || 'Hello',
        content: `<p>We received a request to reset your password. Use the button below to continue.</p>`,
        actionLabel: 'Reset password',
        actionUrl: resetLink || 'https://bsmartq.app/password-reset',
        footerText: 'If you did not request this, you can ignore this email.',
      }),
    });
  }

  async function sendEmailVerificationEmail({ to, customerName, verifyLink }) {
    return sendEmail({
      to,
      subject: 'Verify your email',
      text: `Hello ${customerName}, please verify your email address.`,
      category: 'email_verification',
      metadata: { type: 'email_verification' },
      html: buildBaseTemplate({
        title: 'Verify your email',
        preheader: 'Confirm your address to continue',
        greeting: customerName || 'Hello',
        content: `<p>Please verify your email address to activate your account and continue using BsmartQ.</p>`,
        actionLabel: 'Verify email',
        actionUrl: verifyLink || 'https://bsmartq.app/verify',
        footerText: 'This verification link will expire shortly.',
      }),
    });
  }

  function setDbPool(pool) {
    resolvedDbPool = pool;
  }

  return {
    sendEmail,
    sendCustomerInvitationEmail,
    sendStaffInvitationEmail,
    sendBookingConfirmationEmail,
    sendPaymentReceiptEmail,
    sendQueueUpdateEmail,
    sendAppointmentReminderEmail,
    sendPasswordResetEmail,
    sendEmailVerificationEmail,
    setDbPool,
    ensureNotificationsTable,
  };
}

const defaultEmailService = createEmailService();

module.exports = {
  createEmailService,
  defaultEmailService,
  buildBaseTemplate,
};
