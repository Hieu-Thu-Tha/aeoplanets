import { Resend } from 'resend';
import { trialDayAdjective, trialDaysPhrase } from '@shared/trial';

const BRANDED_FROM =
  process.env.RESEND_FROM_EMAIL ||
  'AEOSTARS <notifications@notifications.aeostars.com>';
const PRODUCTION_BASE_URL = 'https://aeostars.com';

export function getBaseUrl(): string {
  return process.env.APP_URL || PRODUCTION_BASE_URL;
}

function getLogoUrl(): string {
  return `${getBaseUrl()}/aeostars-logo.png`;
}

async function getResendClient(): Promise<{ client: Resend; fromEmail: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY not set — add the Resend API key to secrets');
  }

  console.log('Resend connected. Using from:', BRANDED_FROM);
  return { client: new Resend(apiKey), fromEmail: BRANDED_FROM };
}

function emailHeader(): string {
  return `
    <div style="background-color: #000000; padding: 32px 24px; text-align: center;">
      <img src="${getLogoUrl()}" alt="AEO by Mr Bobble" style="max-height: 40px; max-width: 220px; width: auto; height: auto; margin: 0 auto 12px; display: block;" />
      <p style="color: #94a3b8; font-size: 12px; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">AI Representation & Visibility Intelligence</p>
    </div>
  `;
}

function emailFooter(): string {
  return `
    <div style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
      <p style="color: #94a3b8; font-size: 12px; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        AEOSTARS - AI Visibility Intelligence Platform | Bobble Digital Ltd
      </p>
    </div>
  `;
}

function emailWrapper(content: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; margin-top: 32px; margin-bottom: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        ${emailHeader()}
        <div style="padding: 32px;">
          ${content}
        </div>
        ${emailFooter()}
      </div>
    </body>
    </html>
  `;
}

function ctaButton(text: string, url: string): string {
  return `
    <div style="text-align: center; margin: 32px 0;">
      <a href="${url}" style="background-color: #3b82f6; color: #ffffff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block;">
        ${text}
      </a>
    </div>
  `;
}

export async function sendVerificationEmail(params: {
  to: string;
  firstName: string;
  verificationUrl: string;
}): Promise<void> {
  try {
    const { client, fromEmail } = await getResendClient();
    const html = emailWrapper(`
      <h2 style="color: #1e293b; font-size: 22px; margin: 0 0 16px;">Confirm Your Email Address</h2>
      <p style="color: #475569; font-size: 16px; line-height: 1.6;">
        Hi ${params.firstName}, thanks for signing up for AEOSTARS!
      </p>
      <p style="color: #475569; font-size: 16px; line-height: 1.6;">
        Please confirm your email address by clicking the button below. This link will expire in 24 hours.
      </p>
      ${ctaButton('Confirm Email Address', params.verificationUrl)}
      <p style="color: #94a3b8; font-size: 13px; line-height: 1.5;">
        If you didn't create an AEOSTARS account, you can safely ignore this email.
      </p>
    `);

    const sendResult = await client.emails.send({
      from: fromEmail,
      to: params.to,
      subject: 'Confirm your AEOSTARS email address',
      html,
    });
    console.log('Verification email result:', JSON.stringify(sendResult));
  } catch (error) {
    console.error('Failed to send verification email:', error);
    throw error;
  }
}

export async function sendPasswordResetEmail(params: {
  to: string;
  firstName?: string | null;
  resetUrl: string;
}): Promise<void> {
  try {
    const { client, fromEmail } = await getResendClient();
    const greeting = params.firstName ? `Hi ${params.firstName},` : 'Hi there,';
    const html = emailWrapper(`
      <h2 style="color: #1e293b; font-size: 22px; margin: 0 0 16px;">Reset Your Password</h2>
      <p style="color: #475569; font-size: 16px; line-height: 1.6;">
        ${greeting} we received a request to reset your AEOSTARS password.
      </p>
      <p style="color: #475569; font-size: 16px; line-height: 1.6;">
        Click the button below to choose a new password. This link will expire in 1 hour.
      </p>
      ${ctaButton('Reset Password', params.resetUrl)}
      <p style="color: #94a3b8; font-size: 13px; line-height: 1.5;">
        If you didn't request a password reset, you can safely ignore this email. Your password will not change.
      </p>
    `);

    const sendResult = await client.emails.send({
      from: fromEmail,
      to: params.to,
      subject: 'Reset your AEOSTARS password',
      html,
    });
    if (sendResult.error) {
      throw new Error(`Resend rejected password reset email: ${sendResult.error.message}`);
    }
    console.log('Password reset email result:', JSON.stringify(sendResult));
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    throw error;
  }
}

export async function sendTeamInviteEmail(params: {
  to: string;
  inviterName: string;
  brandName: string;
  inviteUrl: string;
}): Promise<void> {
  try {
    const { client, fromEmail } = await getResendClient();
    const html = emailWrapper(`
      <h2 style="color: #1e293b; font-size: 22px; margin: 0 0 16px;">Welcome to AEOSTARS</h2>
      <p style="color: #475569; font-size: 16px; line-height: 1.6;">
        <strong>${params.inviterName}</strong> has invited you to collaborate on improving AEO for <strong>${params.brandName}</strong>.
      </p>
      <p style="color: #475569; font-size: 16px; line-height: 1.6;">
        AEOSTARS helps brands understand and enhance their presence in AI-generated responses from major LLMs like ChatGPT, Claude, and Gemini.
      </p>
      ${ctaButton('Accept Invitation', params.inviteUrl)}
      <p style="color: #94a3b8; font-size: 13px; line-height: 1.5;">
        This invitation expires in 7 days. If you didn't expect this invitation, you can safely ignore this email.
      </p>
    `);

    const sendResult = await client.emails.send({
      from: fromEmail,
      to: params.to,
      subject: `${params.inviterName} invited you to collaborate on AEOSTARS`,
      html,
    });
    console.log('Team invite email result:', JSON.stringify(sendResult));
  } catch (error) {
    console.error('Failed to send team invite email:', error);
  }
}

export async function sendTicketAssignedEmail(params: {
  to: string;
  assigneeName: string;
  ticketTitle: string;
  brandName: string;
  assignedBy: string;
}): Promise<void> {
  try {
    const { client, fromEmail } = await getResendClient();
    const html = emailWrapper(`
      <h2 style="color: #1e293b; font-size: 22px; margin: 0 0 16px;">Ticket Assigned to You</h2>
      <p style="color: #475569; font-size: 16px; line-height: 1.6;">
        Hi ${params.assigneeName}, <strong>${params.assignedBy}</strong> has assigned you a ticket for <strong>${params.brandName}</strong>:
      </p>
      <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 16px; margin: 16px 0; border-radius: 0 6px 6px 0;">
        <p style="color: #1e293b; font-size: 16px; font-weight: 600; margin: 0;">${params.ticketTitle}</p>
      </div>
      <p style="color: #475569; font-size: 14px;">
        Log in to AEOSTARS to view and manage this ticket.
      </p>
    `);

    await client.emails.send({
      from: fromEmail,
      to: params.to,
      subject: `Ticket assigned: ${params.ticketTitle}`,
      html,
    });
    console.log('Ticket assigned email sent to:', params.to);
  } catch (error) {
    console.error('Failed to send ticket assigned email:', error);
  }
}

export async function sendMentionEmail(params: {
  to: string;
  recipientName: string;
  mentionedBy: string;
  ticketTitle: string;
  brandName: string;
  commentText: string;
  ticketUrl: string;
}): Promise<void> {
  try {
    const { client, fromEmail } = await getResendClient();
    const sanitizedComment = params.commentText
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .substring(0, 500);

    const html = emailWrapper(`
      <h2 style="color: #1e293b; font-size: 22px; margin: 0 0 16px;">You were mentioned in a comment</h2>
      <p style="color: #475569; font-size: 16px; line-height: 1.6;">
        Hi ${params.recipientName}, <strong>${params.mentionedBy}</strong> mentioned you in a comment on a ticket for <strong>${params.brandName}</strong>:
      </p>
      <div style="background-color: #f8fafc; border-left: 4px solid #8b5cf6; padding: 16px; margin: 16px 0; border-radius: 0 6px 6px 0;">
        <p style="color: #1e293b; font-size: 16px; font-weight: 600; margin: 0 0 8px;">${params.ticketTitle}</p>
        <p style="color: #475569; font-size: 14px; margin: 0; white-space: pre-wrap;">${sanitizedComment}</p>
      </div>
      ${ctaButton('View Ticket', params.ticketUrl)}
      <p style="color: #94a3b8; font-size: 13px;">
        You received this email because you were @mentioned in a comment.
      </p>
    `);

    await client.emails.send({
      from: fromEmail,
      to: params.to,
      subject: `${params.mentionedBy} mentioned you: ${params.ticketTitle}`,
      html,
    });
    console.log('Mention email sent to:', params.to);
  } catch (error) {
    console.error('Failed to send mention email:', error);
  }
}

export async function sendTrialInviteEmail(params: {
  to: string;
  brandName: string;
  signupUrl: string;
  trialDurationDays: number;
}): Promise<void> {
  try {
    const { client, fromEmail } = await getResendClient();
    const html = emailWrapper(`
      <h2 style="color: #1e293b; font-size: 22px; margin: 0 0 16px;">Your AI Visibility Report is Ready</h2>
      <p style="color: #475569; font-size: 16px; line-height: 1.6;">
        We've completed an AI visibility scan for <strong>${params.brandName}</strong> across ChatGPT, Claude, and Gemini.
      </p>
      <p style="color: #475569; font-size: 16px; line-height: 1.6;">
        Your report shows how <strong>${params.brandName}</strong> appears when people ask AI assistants about your industry, products, and competitors.
      </p>
      <p style="color: #475569; font-size: 16px; line-height: 1.6;">
        Sign up for your free ${trialDayAdjective(params.trialDurationDays)} trial to see the full results:
      </p>
      ${ctaButton('See Your Results', params.signupUrl)}
      <p style="color: #94a3b8; font-size: 13px; line-height: 1.5;">
        This is a complimentary report prepared by the AEOSTARS team. Your free trial includes full access to your visibility dashboard for ${trialDaysPhrase(params.trialDurationDays)} from signup.
      </p>
    `);

    const sendResult = await client.emails.send({
      from: fromEmail,
      to: params.to,
      subject: `Your AI visibility report for ${params.brandName} is ready`,
      html,
    });
    console.log('Trial invite email result:', JSON.stringify(sendResult));
  } catch (error) {
    console.error('Failed to send trial invite email:', error);
    throw error;
  }
}

export async function sendTrialRequestReceivedEmail(params: {
  to: string;
  firstName: string;
  websiteUrl: string;
}): Promise<void> {
  try {
    const { client, fromEmail } = await getResendClient();
    const html = emailWrapper(`
      <h2 style="color: #1e293b; font-size: 22px; margin: 0 0 16px;">We've received your trial request</h2>
      <p style="color: #475569; font-size: 16px; line-height: 1.6;">
        Hi ${params.firstName}, thanks for requesting a free trial of AEOSTARS.
      </p>
      <p style="color: #475569; font-size: 16px; line-height: 1.6;">
        We've received your request for <strong>${params.websiteUrl}</strong> and our team is reviewing it now.
      </p>
      <p style="color: #475569; font-size: 16px; line-height: 1.6;">
        Once approved, we'll run an AI visibility scan across ChatGPT, Claude, and Gemini for your brand and email you a separate invite link to access your dashboard. This usually happens within one business day.
      </p>
      <p style="color: #94a3b8; font-size: 13px; line-height: 1.5;">
        If you didn't request this trial, you can safely ignore this email.
      </p>
    `);

    const sendResult = await client.emails.send({
      from: fromEmail,
      to: params.to,
      subject: 'Your AEOSTARS free trial request',
      html,
    });
    console.log('Trial request received email result:', JSON.stringify(sendResult));
  } catch (error) {
    console.error('Failed to send trial request received email:', error);
  }
}

function formatMoney(amountMinor: number, currency: string): string {
  const code = (currency || 'GBP').toUpperCase();
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${code}`;
  }
}

function formatDateRange(start: Date | null, end: Date | null): string {
  if (!start || !end) return '';
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

export async function sendInvoicePaidEmail(params: {
  to: string;
  recipientName?: string | null;
  planDisplayName: string;
  amountMinor: number;
  currency: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  invoiceNumber?: string | null;
  hostedInvoiceUrl?: string | null;
  billingPageUrl: string;
}): Promise<void> {
  try {
    const { client, fromEmail } = await getResendClient();
    const greeting = params.recipientName ? `Hi ${params.recipientName},` : 'Hi there,';
    const period = formatDateRange(params.periodStart, params.periodEnd);
    const amount = formatMoney(params.amountMinor, params.currency);
    const html = emailWrapper(`
      <h2 style="color: #1e293b; font-size: 22px; margin: 0 0 16px;">Payment received — thank you</h2>
      <p style="color: #475569; font-size: 16px; line-height: 1.6;">
        ${greeting} we've received your payment for <strong>AEOSTARS ${params.planDisplayName}</strong>.
      </p>
      <div style="background-color: #f8fafc; border-left: 4px solid #10b981; padding: 16px; margin: 16px 0; border-radius: 0 6px 6px 0;">
        <p style="color: #1e293b; font-size: 16px; font-weight: 600; margin: 0 0 8px;">${params.planDisplayName} — ${amount}</p>
        ${period ? `<p style="color: #475569; font-size: 14px; margin: 0 0 4px;">Billing period: ${period}</p>` : ''}
        ${params.invoiceNumber ? `<p style="color: #475569; font-size: 14px; margin: 0;">Invoice: ${params.invoiceNumber}</p>` : ''}
      </div>
      ${params.hostedInvoiceUrl ? ctaButton('View Invoice', params.hostedInvoiceUrl) : ''}
      <p style="color: #475569; font-size: 14px; line-height: 1.6;">
        You can review past invoices and manage your subscription on your
        <a href="${params.billingPageUrl}" style="color: #3b82f6; text-decoration: none;">billing page</a>.
      </p>
      <p style="color: #94a3b8; font-size: 13px; line-height: 1.5;">
        This is a confirmation receipt from AEOSTARS. No action is needed.
      </p>
    `);

    const sendResult = await client.emails.send({
      from: fromEmail,
      to: params.to,
      subject: `Payment received — AEOSTARS ${params.planDisplayName}${params.invoiceNumber ? ` (${params.invoiceNumber})` : ''}`,
      html,
    });
    console.log('Invoice paid email result:', JSON.stringify(sendResult));
  } catch (error) {
    console.error('Failed to send invoice paid email:', error);
  }
}

export async function sendInvoicePaymentFailedEmail(params: {
  to: string;
  recipientName?: string | null;
  planDisplayName: string;
  amountMinor: number;
  currency: string;
  invoiceNumber?: string | null;
  hostedInvoiceUrl?: string | null;
  updatePaymentUrl: string;
}): Promise<void> {
  try {
    const { client, fromEmail } = await getResendClient();
    const greeting = params.recipientName ? `Hi ${params.recipientName},` : 'Hi there,';
    const amount = formatMoney(params.amountMinor, params.currency);
    const html = emailWrapper(`
      <h2 style="color: #1e293b; font-size: 22px; margin: 0 0 16px;">We couldn't process your payment</h2>
      <p style="color: #475569; font-size: 16px; line-height: 1.6;">
        ${greeting} we tried to charge your card for <strong>AEOSTARS ${params.planDisplayName}</strong> but the payment didn't go through.
      </p>
      <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; margin: 16px 0; border-radius: 0 6px 6px 0;">
        <p style="color: #1e293b; font-size: 16px; font-weight: 600; margin: 0 0 8px;">${params.planDisplayName} — ${amount}</p>
        ${params.invoiceNumber ? `<p style="color: #475569; font-size: 14px; margin: 0;">Invoice: ${params.invoiceNumber}</p>` : ''}
      </div>
      <p style="color: #475569; font-size: 16px; line-height: 1.6;">
        To keep your subscription active, please update your payment method.
      </p>
      ${ctaButton('Update Payment Method', params.updatePaymentUrl)}
      ${params.hostedInvoiceUrl ? `<p style="color: #475569; font-size: 14px; line-height: 1.6;">You can also <a href="${params.hostedInvoiceUrl}" style="color: #3b82f6; text-decoration: none;">view this invoice</a> directly.</p>` : ''}
      <p style="color: #94a3b8; font-size: 13px; line-height: 1.5;">
        If you've already updated your card, you can safely ignore this email — Stripe will retry automatically.
      </p>
    `);

    const sendResult = await client.emails.send({
      from: fromEmail,
      to: params.to,
      subject: `Action required — payment failed for AEOSTARS ${params.planDisplayName}`,
      html,
    });
    console.log('Invoice payment failed email result:', JSON.stringify(sendResult));
  } catch (error) {
    console.error('Failed to send invoice payment failed email:', error);
  }
}

export async function sendPaymentSetupRequiredEmail(params: {
  to: string;
  recipientName?: string | null;
  planDisplayName: string;
  checkoutUrl: string;
}): Promise<void> {
  try {
    const { client, fromEmail } = await getResendClient();
    const greeting = params.recipientName ? `Hi ${params.recipientName},` : 'Hi there,';
    const html = emailWrapper(`
      <h2 style="color: #1e293b; font-size: 22px; margin: 0 0 16px;">Action required — finish setting up your billing</h2>
      <p style="color: #475569; font-size: 16px; line-height: 1.6;">
        ${greeting} your AEOSTARS <strong>${params.planDisplayName}</strong> account is active, but we don't have a payment method on file yet.
      </p>
      <p style="color: #475569; font-size: 16px; line-height: 1.6;">
        To keep your access uninterrupted, please complete a quick secure checkout. It takes less than a minute and we'll handle the rest.
      </p>
      ${ctaButton('Complete Secure Checkout', params.checkoutUrl)}
      <p style="color: #94a3b8; font-size: 13px; line-height: 1.5;">
        If you've already completed checkout, you can ignore this email. Need help? Just reply to this message.
      </p>
    `);

    const sendResult = await client.emails.send({
      from: fromEmail,
      to: params.to,
      subject: `Action required — finish setting up billing for AEOSTARS ${params.planDisplayName}`,
      html,
    });
    console.log('Payment setup required email result:', JSON.stringify(sendResult));
  } catch (error) {
    console.error('Failed to send payment setup required email:', error);
  }
}

export async function sendScheduledAiQuotaExhaustedEmail(params: {
  to: string;
  firstName?: string | null;
  resetsAt: Date;
}): Promise<void> {
  const { client, fromEmail } = await getResendClient();
  const greeting = params.firstName ? `Hi ${params.firstName},` : 'Hi there,';
  const resetsAt = params.resetsAt.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
  const html = emailWrapper(`
    <h2 style="color: #1e293b; font-size: 22px; margin: 0 0 16px;">Your scheduled updates are taking a short break</h2>
    <p style="color: #475569; font-size: 16px; line-height: 1.6;">
      ${greeting} you've reached the AI usage included in your current plan, so we've temporarily paused your scheduled updates.
    </p>
    <p style="color: #475569; font-size: 16px; line-height: 1.6;">
      We paused things before starting the next update, so it did not use any additional allowance. Your scheduled updates can run again when your allowance renews on ${resetsAt}.
    </p>
    <p style="color: #475569; font-size: 16px; line-height: 1.6;">
      If you'd like to continue sooner, you can explore a plan with more usage. We're here to help if you have any questions.
    </p>
    ${ctaButton('Explore Plans', `${getBaseUrl()}/select-plan`)}
  `);
  const sendResult = await client.emails.send({
    from: fromEmail,
    to: params.to,
    subject: 'Your scheduled AEOSTARS updates are temporarily paused',
    html,
  });
  if (sendResult.error) {
    throw new Error(`Resend rejected scheduled AI quota email: ${sendResult.error.message}`);
  }
  console.log('Scheduled AI quota email result:', JSON.stringify(sendResult));
}

export async function sendTicketUpdateEmail(params: {
  to: string;
  recipientName: string;
  ticketTitle: string;
  brandName: string;
  changeDescription: string;
  changedBy: string;
}): Promise<void> {
  try {
    const { client, fromEmail } = await getResendClient();
    const html = emailWrapper(`
      <h2 style="color: #1e293b; font-size: 22px; margin: 0 0 16px;">Ticket Updated</h2>
      <p style="color: #475569; font-size: 16px; line-height: 1.6;">
        Hi ${params.recipientName}, a ticket for <strong>${params.brandName}</strong> has been updated:
      </p>
      <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 16px; margin: 16px 0; border-radius: 0 6px 6px 0;">
        <p style="color: #1e293b; font-size: 16px; font-weight: 600; margin: 0 0 8px;">${params.ticketTitle}</p>
        <p style="color: #475569; font-size: 14px; margin: 0;">${params.changeDescription}</p>
      </div>
      <p style="color: #94a3b8; font-size: 13px;">
        Changed by: ${params.changedBy}
      </p>
    `);

    await client.emails.send({
      from: fromEmail,
      to: params.to,
      subject: `Ticket updated: ${params.ticketTitle}`,
      html,
    });
    console.log('Ticket update email sent to:', params.to);
  } catch (error) {
    console.error('Failed to send ticket update email:', error);
  }
}
