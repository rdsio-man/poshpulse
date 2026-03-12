/**
 * mailer.js — Email notifications via Nodemailer (Gmail SMTP).
 *
 * Two types of emails:
 *   1. Daily digest — sent once per day summarizing all relist actions
 *   2. Captcha alert — immediate alert when a captcha is detected
 */

const nodemailer = require('nodemailer');
const config = require('../config');

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  _transporter = nodemailer.createTransport({
    host: config.email.smtpHost,
    port: config.email.smtpPort,
    secure: false,
    auth: {
      user: config.email.smtpUser,
      pass: config.email.smtpPass,
    },
  });

  return _transporter;
}

/**
 * Send the daily relist digest email.
 *
 * @param {Array<{ title: string, timestamp: string, success: boolean }>} relistLog
 */
async function sendDailyDigest(relistLog) {
  if (!config.email.smtpUser || !config.email.smtpPass) {
    console.warn('[mailer] SMTP not configured — skipping daily digest');
    return;
  }

  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Los_Angeles',
  });

  const successful = relistLog.filter((r) => r.success);
  const failed = relistLog.filter((r) => !r.success);

  const rows = relistLog.map((r) =>
    `<tr>
      <td style="padding:6px 12px; border-bottom:1px solid #eee;">${r.timestamp}</td>
      <td style="padding:6px 12px; border-bottom:1px solid #eee;">${r.title}</td>
      <td style="padding:6px 12px; border-bottom:1px solid #eee; color:${r.success ? '#27ae60' : '#e74c3c'}">
        ${r.success ? '✅ Success' : '❌ Failed'}
      </td>
    </tr>`
  ).join('');

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color:#1a1a2e;">🔄 PoshPulse Daily Relist Report</h2>
      <p style="color:#666;">${date}</p>
      <p>
        <strong>${successful.length}</strong> listings relisted successfully.
        ${failed.length > 0 ? `<strong style="color:#e74c3c;">${failed.length} failed.</strong>` : ''}
      </p>
      <table style="width:100%; border-collapse:collapse; margin-top:16px;">
        <thead>
          <tr style="background:#f5f5f5;">
            <th style="padding:8px 12px; text-align:left;">Timestamp (PT)</th>
            <th style="padding:8px 12px; text-align:left;">Listing</th>
            <th style="padding:8px 12px; text-align:left;">Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="color:#aaa; font-size:12px; margin-top:24px;">Sent by PoshPulse 🤖</p>
    </div>
  `;

  await getTransporter().sendMail({
    from: `"PoshPulse" <${config.email.smtpUser}>`,
    to: config.email.to,
    subject: `PoshPulse Digest — ${successful.length} relists on ${date}`,
    html,
  });

  console.log(`[mailer] Daily digest sent — ${successful.length} relists`);
}

/**
 * Send an immediate captcha alert.
 *
 * @param {string} context  Where the captcha was detected (e.g. "login", "share")
 */
async function sendCaptchaAlert(context) {
  if (!config.email.smtpUser || !config.email.smtpPass) {
    console.warn('[mailer] SMTP not configured — skipping captcha alert');
    return;
  }

  const timestamp = new Date().toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'full',
    timeStyle: 'medium',
  });

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color:#e74c3c;">⚠️ PoshPulse — CAPTCHA Detected</h2>
      <p><strong>Time:</strong> ${timestamp} (PT)</p>
      <p><strong>Where:</strong> ${context}</p>
      <p>PoshPulse has paused automation. Manual intervention may be required to solve the CAPTCHA and resume.</p>
      <p style="color:#aaa; font-size:12px; margin-top:24px;">Sent by PoshPulse 🤖</p>
    </div>
  `;

  await getTransporter().sendMail({
    from: `"PoshPulse" <${config.email.smtpUser}>`,
    to: config.email.to,
    subject: `⚠️ PoshPulse CAPTCHA Alert — ${timestamp}`,
    html,
  });

  console.log('[mailer] CAPTCHA alert sent');
}

module.exports = { sendDailyDigest, sendCaptchaAlert };
