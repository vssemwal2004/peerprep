     import EmailTemplate from '../models/EmailTemplate.js';

export const EMAIL_TEMPLATE_TYPES = {
  ONBOARDING: 'ONBOARDING',
  PASSWORD_RESET: 'PASSWORD_RESET',
  EVENT_NOTIFICATION: 'EVENT_NOTIFICATION',
  ASSESSMENT_NOTIFICATION: 'ASSESSMENT_NOTIFICATION',
  SLOT_PROPOSAL: 'SLOT_PROPOSAL',
  SLOT_ACCEPTED: 'SLOT_ACCEPTED',
  SLOT_COUNTER: 'SLOT_COUNTER',
  INTERVIEW_SCHEDULED: 'INTERVIEW_SCHEDULED',
};

const defaultTemplates = [
  {
    type: EMAIL_TEMPLATE_TYPES.ONBOARDING,
    name: 'Welcome Email',
    subject: 'Welcome to PeerPrep - Your Account Details',
    variables: ['studentId', 'password', 'dashboardUrl'],
    htmlContent: `
      <div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:600px;">
        <p style="margin-bottom:20px;">Dear Student,</p>
        <p style="margin-bottom:16px;">Welcome to <strong>PeerPrep - Mock Interview System</strong>! Your account has been successfully created.</p>
        <div style="background:#f0f9ff;padding:24px;border-radius:8px;border-left:4px solid #0ea5e9;margin:24px 0;">
          <p style="margin:0 0 12px 0;font-size:17px;font-weight:700;color:#0c4a6e;">Your Login Credentials</p>
          <table style="width:100%;font-size:15px;">
            <tr>
              <td style="padding:8px 0;color:#475569;width:40%;"><strong>Student ID:</strong></td>
              <td style="padding:8px 0;color:#0f172a;font-weight:600;">{{studentId}}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#475569;"><strong>Temporary Password:</strong></td>
              <td style="padding:8px 0;color:#0f172a;font-weight:600;">{{password}}</td>
            </tr>
          </table>
        </div>
        <div style="background:#fef3c7;padding:16px;border-radius:6px;margin:24px 0;border-left:3px solid #f59e0b;">
          <p style="margin:0;font-size:14px;color:#78350f;"><strong>Important Security Notice:</strong></p>
          <p style="margin:8px 0 0 0;font-size:14px;color:#78350f;">For your security, please change your password immediately after your first login.</p>
        </div>
        <div style="text-align:center;margin:32px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
            <tr>
              <td style="border-radius:8px;background:#0ea5e9;">
                <a href="{{dashboardUrl}}" target="_blank" style="display:inline-block;padding:16px 40px;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;background:#0ea5e9;">Go to Dashboard</a>
              </td>
            </tr>
          </table>
        </div>
        <p style="margin-top:28px;color:#64748b;font-size:14px;">If you have any questions or need assistance, please contact your program administrator.</p>
        <p style="margin-top:24px;">Best regards,<br/><strong>PeerPrep Team</strong></p>
      </div>
    `.trim(),
  },
  {
    type: EMAIL_TEMPLATE_TYPES.PASSWORD_RESET,
    name: 'Password Reset',
    subject: 'Password Reset Request - PeerPrep',
    variables: ['name', 'resetUrl', 'dashboardUrl'],
    htmlContent: `
      <div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:600px;">
        <p style="margin-bottom:20px;">Dear {{name}},</p>
        <p style="margin-bottom:16px;">We received a request to reset your password for your <strong>PeerPrep</strong> account.</p>
        <div style="background:#dbeafe;padding:20px;border-radius:8px;margin:24px 0;text-align:center;">
          <p style="margin:0 0 16px 0;font-size:14px;color:#1e3a8a;">Click the button below to reset your password:</p>
          <a href="{{resetUrl}}" style="display:inline-block;padding:14px 32px;background:#0ea5e9;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;">Reset Password</a>
          <p style="margin:16px 0 0 0;font-size:13px;color:#475569;">This link is valid for 1 hour</p>
        </div>
        <div style="background:#f1f5f9;padding:16px;border-radius:6px;margin:24px 0;">
          <p style="margin:0;font-size:13px;color:#475569;">Or copy and paste this link in your browser:</p>
          <p style="margin:8px 0 0 0;font-size:13px;color:#0ea5e9;word-break:break-all;">{{resetUrl}}</p>
        </div>
        <div style="background:#fef3c7;padding:16px;border-radius:6px;margin:24px 0;border-left:3px solid #f59e0b;">
          <p style="margin:0;font-size:14px;color:#78350f;"><strong>Security Notice:</strong></p>
          <p style="margin:8px 0 0 0;font-size:14px;color:#78350f;">If you did not request this password reset, please ignore this email. Your password will remain unchanged.</p>
        </div>
        <div style="text-align:center;margin:32px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
            <tr>
              <td style="border-radius:8px;background:#0ea5e9;">
                <a href="{{dashboardUrl}}" target="_blank" style="display:inline-block;padding:16px 40px;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;background:#0ea5e9;">Go to Dashboard</a>
              </td>
            </tr>
          </table>
        </div>
        <p>Best regards,<br/>PeerPrep Team</p>
      </div>
    `.trim(),
  },
  {
    type: EMAIL_TEMPLATE_TYPES.EVENT_NOTIFICATION,
    name: 'Interview Scheduled (Event)',
    subject: 'Mock Interview: {{title}}',
    variables: ['title', 'date', 'details', 'templateSection', 'dashboardUrl'],
    htmlContent: `
      <div style="font-family:Arial,sans-serif;font-size:15px;color:#222;">
        <p>Dear Student,</p>
        <p>A mock interview has been scheduled for you. Please find the details below:</p>
        <p>
          <strong>Mock Interview:</strong> {{title}}<br/>
          <strong>Date:</strong> {{date}}<br/>
          <strong>Details:</strong> {{details}}
          {{templateSection}}
        </p>
        <p>Please check your dashboard for pairing information and to propose interview slots.</p>
        <div style="text-align:center;margin:32px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
            <tr>
              <td style="border-radius:8px;background:#0ea5e9;">
                <a href="{{dashboardUrl}}" target="_blank" style="display:inline-block;padding:16px 40px;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;background:#0ea5e9;">Go to Dashboard</a>
              </td>
            </tr>
          </table>
        </div>
        <p>Best regards,<br/>PeerPrep Team</p>
      </div>
    `.trim(),
  },
  {
    type: EMAIL_TEMPLATE_TYPES.ASSESSMENT_NOTIFICATION,
    name: 'Assessment Notification',
    subject: 'New Assessment: {{assessmentTitle}}',
    variables: ['studentName', 'assessmentTitle', 'startLabel', 'endLabel', 'duration', 'dashboardUrl'],
    htmlContent: `
      <div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:600px;">
        <p style="margin-bottom:20px;">Dear {{studentName}},</p>
        <p style="margin-bottom:16px;">A new assessment has been scheduled for you. Please find the details below:</p>
        <div style="background:#f0f9ff;padding:24px;border-radius:8px;border-left:4px solid #0ea5e9;margin:24px 0;">
          <p style="margin:0 0 12px 0;font-size:17px;font-weight:700;color:#0c4a6e;">Assessment Details</p>
          <table style="width:100%;font-size:15px;">
            <tr>
              <td style="padding:8px 0;color:#475569;width:40%;"><strong>Title:</strong></td>
              <td style="padding:8px 0;color:#0f172a;font-weight:600;">{{assessmentTitle}}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#475569;"><strong>Start Time:</strong></td>
              <td style="padding:8px 0;color:#0f172a;font-weight:600;">{{startLabel}}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#475569;"><strong>End Time:</strong></td>
              <td style="padding:8px 0;color:#0f172a;font-weight:600;">{{endLabel}}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#475569;"><strong>Duration:</strong></td>
              <td style="padding:8px 0;color:#0f172a;font-weight:600;">{{duration}}</td>
            </tr>
          </table>
        </div>
        <div style="background:#fef3c7;padding:16px;border-radius:6px;margin:24px 0;border-left:3px solid #f59e0b;">
          <p style="margin:0;font-size:14px;color:#78350f;"><strong>Important:</strong></p>
          <p style="margin:8px 0 0 0;font-size:14px;color:#78350f;">You can attempt this assessment only within the allowed time window.</p>
        </div>
        <div style="text-align:center;margin:32px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
            <tr>
              <td style="border-radius:8px;background:#0ea5e9;">
                <a href="{{dashboardUrl}}" target="_blank" style="display:inline-block;padding:16px 40px;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;background:#0ea5e9;">Go to Dashboard</a>
              </td>
            </tr>
          </table>
        </div>
        <p style="margin-top:28px;color:#64748b;font-size:14px;">If you have any questions or need assistance, please contact your program administrator.</p>
        <p style="margin-top:24px;">Best regards,<br/><strong>PeerPrep Team</strong></p>
      </div>
    `.trim(),
  },
  {
    type: EMAIL_TEMPLATE_TYPES.SLOT_PROPOSAL,
    name: 'Interview Slot Proposal',
    subject: 'Mock Interview Slot Proposal',
    variables: ['interviewer', 'slotIntro', 'slotsBlock', 'dashboardUrl'],
    htmlContent: `
      <div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:600px;">
        <p style="margin-bottom:20px;">Dear Student,</p>
        <p style="margin-bottom:16px;">Your interviewer <strong style="color:#0ea5e9;">{{interviewer}}</strong> has proposed {{slotIntro}} for your upcoming mock interview:</p>
        {{slotsBlock}}
        <div style="background:#e0f2fe;padding:16px;border-radius:6px;margin:20px 0;border-left:3px solid #0284c7;">
          <p style="margin:0;font-size:14px;color:#0c4a6e;"><strong>Next Steps:</strong></p>
          <p style="margin:8px 0 0 0;font-size:14px;color:#0c4a6e;">Log in to your dashboard to review the proposed slots and respond.</p>
        </div>
        <div style="text-align:center;margin:32px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
            <tr>
              <td style="border-radius:8px;background:#0ea5e9;">
                <a href="{{dashboardUrl}}" target="_blank" style="display:inline-block;padding:16px 40px;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;background:#0ea5e9;">Go to Dashboard</a>
              </td>
            </tr>
          </table>
        </div>
        <p style="margin-top:24px;color:#64748b;font-size:14px;">If you have any questions or concerns, please contact your program coordinator.</p>
        <p style="margin-top:24px;">Best regards,<br/><strong>PeerPrep Team</strong></p>
      </div>
    `.trim(),
  },
  {
    type: EMAIL_TEMPLATE_TYPES.SLOT_ACCEPTED,
    name: 'Interview Slot Accepted',
    subject: 'Mock Interview Slot Accepted',
    variables: ['interviewee', 'slot', 'dashboardUrl'],
    htmlContent: `
      <div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:600px;">
        <p style="margin-bottom:20px;">Dear Interviewer,</p>
        <p style="margin-bottom:16px;">Great news! <strong style="color:#10b981;">{{interviewee}}</strong> has accepted your proposed interview slot:</p>
        <div style="background:#f0fdf4;padding:20px;border-radius:8px;border-left:4px solid #10b981;margin:20px 0;">
          <p style="margin:0;font-size:16px;font-weight:600;color:#065f46;">{{slot}}</p>
        </div>
        <div style="background:#dcfce7;padding:16px;border-radius:6px;margin:20px 0;border-left:3px solid #16a34a;">
          <p style="margin:0;font-size:14px;color:#14532d;"><strong>Next Steps:</strong></p>
          <p style="margin:8px 0 0 0;font-size:14px;color:#14532d;">The mock interview is now scheduled and confirmed. Check your dashboard for the meeting link and details.</p>
        </div>
        <div style="text-align:center;margin:32px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
            <tr>
              <td style="border-radius:8px;background:#0ea5e9;">
                <a href="{{dashboardUrl}}" target="_blank" style="display:inline-block;padding:16px 40px;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;background:#0ea5e9;">Go to Dashboard</a>
              </td>
            </tr>
          </table>
        </div>
        <p style="margin-top:24px;color:#64748b;font-size:14px;">Please ensure you're prepared and available at the scheduled time.</p>
        <p style="margin-top:24px;">Best regards,<br/><strong>PeerPrep Team</strong></p>
      </div>
    `.trim(),
  },
  {
    type: EMAIL_TEMPLATE_TYPES.SLOT_COUNTER,
    name: 'Interview Slot Counter Proposal',
    subject: 'New Slot Proposal from Interviewee',
    variables: ['interviewee', 'slotIntro', 'slotsBlock', 'dashboardUrl'],
    htmlContent: `
      <div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:600px;">
        <p style="margin-bottom:20px;">Dear Interviewer,</p>
        <p style="margin-bottom:16px;"><strong style="color:#f59e0b;">{{interviewee}}</strong> has proposed {{slotIntro}} for the mock interview:</p>
        {{slotsBlock}}
        <div style="background:#fef9c3;padding:16px;border-radius:6px;margin:20px 0;border-left:3px solid #eab308;">
          <p style="margin:0;font-size:14px;color:#713f12;"><strong>Next Steps:</strong></p>
          <p style="margin:8px 0 0 0;font-size:14px;color:#713f12;">Log in to your dashboard to review the proposed slots and respond.</p>
        </div>
        <div style="text-align:center;margin:32px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
            <tr>
              <td style="border-radius:8px;background:#0ea5e9;">
                <a href="{{dashboardUrl}}" target="_blank" style="display:inline-block;padding:16px 40px;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;background:#0ea5e9;">Go to Dashboard</a>
              </td>
            </tr>
          </table>
        </div>
        <p style="margin-top:24px;color:#64748b;font-size:14px;">Please respond at your earliest convenience to finalize the mock interview schedule.</p>
        <p style="margin-top:24px;">Best regards,<br/><strong>PeerPrep Team</strong></p>
      </div>
    `.trim(),
  },
  {
    type: EMAIL_TEMPLATE_TYPES.INTERVIEW_SCHEDULED,
    name: 'Interview Scheduled Confirmation',
    subject: 'Mock Interview Scheduled - Confirmation & Details',
    variables: ['title', 'date', 'detailsSection', 'interviewer', 'dashboardUrl'],
    htmlContent: `
      <div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:600px;">
        <p style="margin-bottom:20px;">Dear Participant,</p>
        <p style="margin-bottom:16px;">Your mock interview has been successfully scheduled! Here are the confirmed details:</p>
        <div style="background:#f0f9ff;padding:24px;border-radius:8px;border-left:4px solid #0ea5e9;margin:24px 0;">
          <p style="margin:0 0 12px 0;font-size:17px;font-weight:700;color:#0c4a6e;">Mock Interview Confirmation</p>
          <table style="width:100%;font-size:15px;">
            <tr>
              <td style="padding:8px 0;color:#475569;width:40%;"><strong>Mock Interview:</strong></td>
              <td style="padding:8px 0;color:#0f172a;font-weight:600;">{{title}}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#475569;"><strong>Date:</strong></td>
              <td style="padding:8px 0;color:#0f172a;font-weight:600;">{{date}}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#475569;"><strong>Interviewer:</strong></td>
              <td style="padding:8px 0;color:#0f172a;">{{interviewer}}</td>
            </tr>
          </table>
        </div>
        <div style="background:#dbeafe;padding:16px;border-radius:6px;margin:24px 0;border-left:3px solid #3b82f6;">
          <p style="margin:0;font-size:14px;color:#1e3a8a;"><strong>Important Reminders:</strong></p>
          <ul style="margin:8px 0 0 20px;padding:0;font-size:14px;color:#1e3a8a;">
            <li style="margin:6px 0;">Please join 5 minutes early to ensure a smooth start</li>
            <li style="margin:6px 0;">Test your camera and microphone beforehand</li>
            <li style="margin:6px 0;">Have your materials prepared and ready to go</li>
            <li style="margin:6px 0;">Check your dashboard for the meeting link and updates</li>
          </ul>
        </div>
        {{detailsSection}}
        <div style="text-align:center;margin:32px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
            <tr>
              <td style="border-radius:8px;background:#0ea5e9;">
                <a href="{{dashboardUrl}}" target="_blank" style="display:inline-block;padding:16px 40px;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;background:#0ea5e9;">Go to Dashboard</a>
              </td>
            </tr>
          </table>
        </div>
        <p style="margin-top:28px;color:#64748b;font-size:14px;">We look forward to a successful mock interview session!</p>
        <p style="margin-top:24px;">Best regards,<br/><strong>PeerPrep Team</strong></p>
      </div>
    `.trim(),
  },
];

export async function seedEmailTemplates() {
  for (const tpl of defaultTemplates) {
    const templateKey = tpl.type;
    const exists = await EmailTemplate.findOne({ type: tpl.type }).select('_id templateKey').lean();
    if (exists) {
      if (!exists.templateKey) {
        await EmailTemplate.updateOne(
          { _id: exists._id },
          { $set: { templateKey } },
          { runValidators: true }
        );
      }
      continue;
    }

    await EmailTemplate.create({ ...tpl, templateKey, isSystem: true });
  }
}

export function getDefaultEmailTemplates() {
  return defaultTemplates.map((tpl) => ({ ...tpl }));
}
