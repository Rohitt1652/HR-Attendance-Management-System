const nodemailer = require('nodemailer');

let _transporter = null;

// Get or create transporter from settings
async function getTransporter() {
  try {
    const Settings = require('../models/Settings');
    const settings = await Settings.getGlobal();
    if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPass) return null;

    _transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort || 587,
      secure: settings.smtpPort === 465,
      auth: { user: settings.smtpUser, pass: settings.smtpPass },
      tls: { rejectUnauthorized: false },
    });
    return _transporter;
  } catch { return null; }
}

/**
 * Send an email. Silently fails if SMTP not configured.
 * @param {string} to - recipient email
 * @param {string} subject
 * @param {string} html - HTML body
 */
async function sendEmail(to, subject, html) {
  if (!to || to.includes('@noemail.local')) return; // skip placeholder emails
  try {
    const transporter = await getTransporter();
    if (!transporter) return; // SMTP not configured — skip silently

    const Settings = require('../models/Settings');
    const settings = await Settings.getGlobal();
    const from = `"${settings.companyName || 'WorkforceOS'}" <${settings.smtpUser}>`;

    await transporter.sendMail({ from, to, subject, html });
    console.log(`[Email] Sent to ${to}: ${subject}`);
  } catch (err) {
    console.warn(`[Email] Failed to send to ${to}:`, err.message);
    // Never throw — email failure should not break the main flow
  }
}

/**
 * Send leave applied notification to approver
 */
async function sendLeaveAppliedEmail(approverEmail, approverName, applicantName, leaveType, duration, startDate) {
  const subject = `New Leave Request — ${applicantName}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #1a237e, #6b2fa0); padding: 24px; border-radius: 12px 12px 0 0;">
        <h2 style="color: #fff; margin: 0;">📋 New Leave Request</h2>
      </div>
      <div style="background: #f8fafc; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0;">
        <p style="color: #374151;">Hi <strong>${approverName}</strong>,</p>
        <p style="color: #374151;"><strong>${applicantName}</strong> has submitted a leave request that requires your approval.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0; background: #fff; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
          <tr style="background: #f1f5f9;"><td style="padding: 10px 16px; font-weight: 600; color: #374151; width: 40%;">Leave Type</td><td style="padding: 10px 16px; color: #1e293b;">${leaveType}</td></tr>
          <tr><td style="padding: 10px 16px; font-weight: 600; color: #374151;">Duration</td><td style="padding: 10px 16px; color: #1e293b;">${duration}</td></tr>
          <tr style="background: #f1f5f9;"><td style="padding: 10px 16px; font-weight: 600; color: #374151;">From</td><td style="padding: 10px 16px; color: #1e293b;">${startDate}</td></tr>
        </table>
        <p style="color: #64748b; font-size: 14px;">Please log in to WorkforceOS to approve or reject this request.</p>
      </div>
    </div>`;
  await sendEmail(approverEmail, subject, html);
}

/**
 * Send leave status update to employee
 */
async function sendLeaveStatusEmail(employeeEmail, employeeName, leaveType, status, reason) {
  const isApproved = status === 'Approved';
  const subject = `Leave ${status} — ${leaveType}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: ${isApproved ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'linear-gradient(135deg, #ef4444, #dc2626)'}; padding: 24px; border-radius: 12px 12px 0 0;">
        <h2 style="color: #fff; margin: 0;">${isApproved ? '✅' : '❌'} Leave ${status}</h2>
      </div>
      <div style="background: #f8fafc; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0;">
        <p style="color: #374151;">Hi <strong>${employeeName}</strong>,</p>
        <p style="color: #374151;">Your <strong>${leaveType}</strong> request has been <strong style="color: ${isApproved ? '#16a34a' : '#dc2626'};">${status}</strong>.</p>
        ${reason ? `<p style="color: #64748b; background: #fee2e2; padding: 12px; border-radius: 8px; border-left: 4px solid #ef4444;"><strong>Reason:</strong> ${reason}</p>` : ''}
        <p style="color: #64748b; font-size: 14px;">Log in to WorkforceOS to view your leave history.</p>
      </div>
    </div>`;
  await sendEmail(employeeEmail, subject, html);
}

module.exports = { sendEmail, sendLeaveAppliedEmail, sendLeaveStatusEmail };
