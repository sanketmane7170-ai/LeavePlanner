/**
 * Default email templates — mirrors prisma/seeds/emailTemplates.ts exactly.
 * Used as in-memory fallback when the DB is unavailable.
 * When you edit the seeder, copy the helpers + TEMPLATES array here too.
 */

export interface TemplateVariable {
  name: string;
  description: string;
  example: string;
}

export interface EmailTemplateDefault {
  key: string;
  name: string;
  description: string;
  category: 'ADMIN' | 'EMPLOYEE';
  subject: string;
  bodyHtml: string;
  variables: TemplateVariable[];
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const COLOR_BRAND      = '#2563EB';
const COLOR_TEXT_DARK  = '#0F172A';
const COLOR_TEXT_BODY  = '#374151';
const COLOR_TEXT_MUTED = '#64748B';
const COLOR_TEXT_HINT  = '#94A3B8';
const COLOR_BORDER     = '#E2E8F0';
const COLOR_SURFACE    = '#F8FAFC';
const COLOR_BG         = '#FFFFFF';
const FONT             = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;";

// ── Layout wrapper ────────────────────────────────────────────────────────────
const WRAP = (orgName: string, tagline: string, body: string) => `
<div style="background:${COLOR_SURFACE};padding:32px 0;${FONT}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="max-width:580px;margin:0 auto;background:${COLOR_BG};
                border:1px solid ${COLOR_BORDER};border-radius:10px;
                overflow:hidden;border-spacing:0;">
    <tr><td style="height:4px;background:${COLOR_BRAND};font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr>
      <td style="padding:24px 32px 20px;border-bottom:1px solid ${COLOR_SURFACE};">
        <p style="margin:0 0 4px 0;font-size:13px;font-weight:700;color:${COLOR_BRAND};letter-spacing:1.2px;text-transform:uppercase;">${orgName}</p>
        <p style="margin:0;font-size:11px;color:${COLOR_TEXT_HINT};">${tagline}</p>
      </td>
    </tr>
    <tr><td style="padding:28px 32px;">${body}</td></tr>
    <tr>
      <td style="padding:16px 32px;background:${COLOR_SURFACE};border-top:1px solid ${COLOR_BORDER};">
        <p style="margin:0;font-size:11px;color:${COLOR_TEXT_HINT};line-height:1.6;">
          This is an automated notification from <strong style="color:${COLOR_TEXT_MUTED};">${orgName}</strong> Leave Planner. Please do not reply to this email.
        </p>
      </td>
    </tr>
  </table>
</div>`.trim();

// ── Shared helpers ────────────────────────────────────────────────────────────
const ROW = (label: string, val: string, last = false) =>
  `<tr>
    <td style="padding:10px 16px;color:${COLOR_TEXT_MUTED};font-size:13px;width:38%;${last ? '' : `border-bottom:1px solid ${COLOR_SURFACE};`}vertical-align:top;">${label}</td>
    <td style="padding:10px 16px;color:${COLOR_TEXT_DARK};font-size:13px;font-weight:600;${last ? '' : `border-bottom:1px solid ${COLOR_SURFACE};`}vertical-align:top;">${val}</td>
  </tr>`;

const TABLE = (rows: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
          style="width:100%;background:${COLOR_SURFACE};border:1px solid ${COLOR_BORDER};border-radius:8px;margin:0 0 24px 0;border-spacing:0;">${rows}</table>`;

const SECTION = (title: string) =>
  `<p style="color:${COLOR_TEXT_HINT};font-size:10px;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:1.2px;font-weight:700;">${title}</p>`;

const BTN = (label: string, url: string) =>
  `<a href="${url}" style="display:inline-block;background:${COLOR_BRAND};color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">${label} &#8594;</a>`;

const DIVIDER = () =>
  `<hr style="border:none;border-top:1px solid ${COLOR_BORDER};margin:0 0 24px 0;">`;

const INTRO = (html: string) =>
  `<p style="color:${COLOR_TEXT_BODY};font-size:14px;line-height:1.7;margin:0 0 24px 0;">${html}</p>`;

// ── Badge HTML (for preview {{example}} values) ───────────────────────────────
const BADGE_PENDING   = `<span style="background:#FEF3C7;color:#92400E;padding:4px 14px;border-radius:999px;font-size:12px;font-weight:700;display:inline-block;">Pending Review</span>`;
const BADGE_APPROVED  = `<span style="background:#DCFCE7;color:#14532D;padding:4px 14px;border-radius:999px;font-size:12px;font-weight:700;display:inline-block;">Approved</span>`;
const BADGE_REJECTED  = `<span style="background:#FEE2E2;color:#7F1D1D;padding:4px 14px;border-radius:999px;font-size:12px;font-weight:700;display:inline-block;">Rejected</span>`;
const BADGE_ABSENT    = `<span style="background:#FFEDD5;color:#78350F;padding:4px 14px;border-radius:999px;font-size:12px;font-weight:700;display:inline-block;">Marked Absent</span>`;
const BADGE_CANCELLED = `<span style="background:#F3F4F6;color:#374151;padding:4px 14px;border-radius:999px;font-size:12px;font-weight:700;display:inline-block;">Cancelled</span>`;

const SAMPLE_COMMENT = `<div style="background:#FFFBEB;border:1px solid #FDE68A;border-left:3px solid #F59E0B;border-radius:6px;padding:14px 16px;margin:0 0 24px 0;"><p style="margin:0;color:#92400E;font-size:13px;line-height:1.6;"><strong>Admin Comment:</strong> Leave rejected due to insufficient notice period.</p></div>`;

// Export badge HTML for use in emailService
export const STATUS_BADGE_HTML = {
  PENDING:   BADGE_PENDING,
  APPROVED:  BADGE_APPROVED,
  REJECTED:  BADGE_REJECTED,
  ABSENT:    BADGE_ABSENT,
  CANCELLED: BADGE_CANCELLED,
};

// ── Template definitions ──────────────────────────────────────────────────────

export const EMAIL_TEMPLATE_DEFAULTS: EmailTemplateDefault[] = [

  {
    key: 'LEAVE_APPLIED_ADMIN', name: 'Leave Request — Admin Notification',
    description: 'Sent to all admins when an employee submits a leave request requiring approval.',
    category: 'ADMIN',
    subject: 'New Leave Request — {{employeeName}} ({{leaveType}})',
    bodyHtml: WRAP('{{orgName}}', 'Leave Management · Admin Notification', `
${INTRO('A new <strong>leave request</strong> has been submitted and requires your review.')}
${SECTION('Employee')}
${TABLE(ROW('Name', '{{employeeName}}') + ROW('Employee ID', '{{employeeId}}') + ROW('Department', '{{department}}', true))}
${SECTION('Leave Details')}
${TABLE(ROW('Leave Type', '{{leaveType}}') + ROW('From', '{{fromDate}}') + ROW('To', '{{toDate}}') + ROW('Duration', '{{duration}}') + ROW('Reason', '{{reason}}', true))}
<div style="margin:0 0 24px 0;">{{statusBadge}}</div>
${BTN('Review Request', '{{reviewUrl}}')}
`),
    variables: [
      { name: 'orgName',      description: 'Organization name',                              example: 'Innovizia'         },
      { name: 'employeeName', description: "Employee's full name",                           example: 'Priya Sharma'      },
      { name: 'employeeId',   description: 'Employee ID code',                               example: 'EMP-0042'          },
      { name: 'department',   description: 'Department name',                                example: 'Engineering'       },
      { name: 'leaveType',    description: 'Human-readable leave type',                      example: 'Sick Leave'        },
      { name: 'fromDate',     description: 'Leave start date',                               example: '15/06/2026'        },
      { name: 'toDate',       description: 'Leave end date',                                 example: '17/06/2026'        },
      { name: 'duration',     description: 'Duration (days or half-day info)',               example: '3 working day(s)'  },
      { name: 'reason',       description: 'Reason provided by the employee',                example: 'Medical appointment and recovery.' },
      { name: 'statusBadge',  description: 'Color-coded status badge (auto-generated HTML)', example: BADGE_PENDING       },
      { name: 'reviewUrl',    description: 'URL to the admin leave requests page',           example: 'http://localhost:3005/admin/leave-requests' },
    ],
  },

  {
    key: 'WFH_APPLIED_ADMIN', name: 'WFH Request — Admin Notification',
    description: 'Sent to all admins when an employee submits a Work From Home request requiring approval.',
    category: 'ADMIN',
    subject: 'New WFH Request — {{employeeName}}',
    bodyHtml: WRAP('{{orgName}}', 'Leave Management · Admin Notification', `
${INTRO('A new <strong>Work From Home request</strong> has been submitted and requires your review.')}
${SECTION('Employee')}
${TABLE(ROW('Name', '{{employeeName}}') + ROW('Employee ID', '{{employeeId}}') + ROW('Department', '{{department}}', true))}
${SECTION('WFH Details')}
${TABLE(ROW('From', '{{fromDate}}') + ROW('To', '{{toDate}}') + ROW('Duration', '{{duration}}') + ROW('Reason', '{{reason}}', true))}
<div style="margin:0 0 24px 0;">{{statusBadge}}</div>
${BTN('Review Request', '{{reviewUrl}}')}
`),
    variables: [
      { name: 'orgName',      description: 'Organization name',                              example: 'Innovizia'         },
      { name: 'employeeName', description: "Employee's full name",                           example: 'Rahul Mehta'       },
      { name: 'employeeId',   description: 'Employee ID code',                               example: 'EMP-0019'          },
      { name: 'department',   description: 'Department name',                                example: 'Product'           },
      { name: 'fromDate',     description: 'WFH start date',                                 example: '10/06/2026'        },
      { name: 'toDate',       description: 'WFH end date',                                   example: '11/06/2026'        },
      { name: 'duration',     description: 'Duration string',                                example: '2 working day(s)'  },
      { name: 'reason',       description: 'Reason provided by the employee',                example: 'Internet installation at home office.' },
      { name: 'statusBadge',  description: 'Color-coded status badge (auto-generated HTML)', example: BADGE_PENDING       },
      { name: 'reviewUrl',    description: 'URL to the admin WFH requests page',             example: 'http://localhost:3005/admin/leave-requests' },
    ],
  },

  {
    key: 'LEAVE_CANCELLED_ADMIN', name: 'Leave Cancelled — Admin Notification',
    description: 'Sent to all admins when an employee cancels a pending leave request.',
    category: 'ADMIN',
    subject: 'Leave Request Cancelled — {{employeeName}}',
    bodyHtml: WRAP('{{orgName}}', 'Leave Management · Admin Notification', `
${INTRO('<strong>{{employeeName}}</strong> has cancelled a pending leave request.')}
${SECTION('Cancelled Leave Details')}
${TABLE(ROW('Employee', '{{employeeName}} ({{employeeId}})') + ROW('Leave Type', '{{leaveType}}') + ROW('From', '{{fromDate}}') + ROW('To', '{{toDate}}') + ROW('Duration', '{{totalDays}} working day(s)', true))}
<div style="margin:0 0 24px 0;">{{statusBadge}}</div>
${DIVIDER()}
<p style="color:${COLOR_TEXT_HINT};font-size:13px;margin:0;">No further action is required. The leave balance has been preserved.</p>
`),
    variables: [
      { name: 'orgName',      description: 'Organization name',                              example: 'Innovizia'       },
      { name: 'employeeName', description: "Employee's full name",                           example: 'Aisha Khan'      },
      { name: 'employeeId',   description: 'Employee ID code',                               example: 'EMP-0033'        },
      { name: 'leaveType',    description: 'Human-readable leave type',                      example: 'Personal Leave'  },
      { name: 'fromDate',     description: 'Leave start date',                               example: '20/06/2026'      },
      { name: 'toDate',       description: 'Leave end date',                                 example: '21/06/2026'      },
      { name: 'totalDays',    description: 'Number of working days',                         example: '2'               },
      { name: 'statusBadge',  description: 'Color-coded status badge (auto-generated HTML)', example: BADGE_CANCELLED   },
    ],
  },

  {
    key: 'EMPLOYEE_WELCOME', name: 'Welcome — New Employee',
    description: "Sent to a new employee when their account is created with their login credentials.",
    category: 'EMPLOYEE',
    subject: 'Welcome to {{orgName}} — Your Account is Ready',
    bodyHtml: WRAP('{{orgName}}', 'Leave Management · Welcome', `
${INTRO('Hello <strong>{{employeeName}}</strong>,<br><br>Your <strong>{{orgName}}</strong> Leave Planner account is ready. Use the credentials below to sign in.')}
${SECTION('Your Login Credentials')}
${TABLE(ROW('Employee ID', '{{employeeId}}') + ROW('Login Email', '{{loginEmail}}') + ROW('Temporary Password', `<span style="font-family:monospace;font-size:17px;letter-spacing:3px;color:${COLOR_BRAND};font-weight:700;">{{tempPassword}}</span>`, true))}
<div style="background:#FEF2F2;border:1px solid #FECACA;border-left:3px solid #EF4444;border-radius:0 6px 6px 0;padding:12px 16px;margin:0 0 24px 0;">
  <p style="margin:0;color:#991B1B;font-size:13px;font-weight:600;line-height:1.6;">&#9888;&nbsp; You will be required to change your password on first login.</p>
</div>
${BTN('Login Now', '{{loginUrl}}')}
`),
    variables: [
      { name: 'orgName',      description: 'Organization name',              example: 'Innovizia'                   },
      { name: 'employeeName', description: "Employee's full name",           example: 'Nilesh Rathod'               },
      { name: 'employeeId',   description: 'Assigned employee ID',           example: 'EMP-0001'                    },
      { name: 'loginEmail',   description: "Employee's login email address", example: 'nilesh@innovizia.com'        },
      { name: 'tempPassword', description: 'Temporary password',             example: 'Temp@9823'                   },
      { name: 'loginUrl',     description: 'Link to the login page',         example: 'http://localhost:3005/login' },
    ],
  },

  {
    key: 'PASSWORD_RESET', name: 'Password Reset',
    description: 'Sent to an employee when an admin resets their password.',
    category: 'EMPLOYEE',
    subject: '{{orgName}} — Your Password Has Been Reset',
    bodyHtml: WRAP('{{orgName}}', 'Leave Management · Security', `
${INTRO('Hello <strong>{{employeeName}}</strong>,<br><br>An administrator has reset your password. Your new temporary password is shown below.')}
<div style="text-align:center;background:${COLOR_SURFACE};border:1px solid ${COLOR_BORDER};border-radius:10px;padding:28px 24px;margin:0 0 24px 0;">
  <p style="color:${COLOR_TEXT_HINT};font-size:10px;margin:0 0 10px 0;text-transform:uppercase;letter-spacing:1.2px;font-weight:700;">Temporary Password</p>
  <p style="font-family:monospace;font-size:30px;letter-spacing:8px;color:${COLOR_BRAND};font-weight:700;margin:0;">{{tempPassword}}</p>
</div>
<div style="background:#FEF2F2;border:1px solid #FECACA;border-left:3px solid #EF4444;border-radius:0 6px 6px 0;padding:12px 16px;margin:0 0 24px 0;">
  <p style="margin:0;color:#991B1B;font-size:13px;font-weight:600;line-height:1.6;">&#9888;&nbsp; Log in immediately and set a new secure password.</p>
</div>
${BTN('Login Now', '{{loginUrl}}')}
`),
    variables: [
      { name: 'orgName',      description: 'Organization name',      example: 'Innovizia'                   },
      { name: 'employeeName', description: "Employee's full name",   example: 'Nilesh Rathod'               },
      { name: 'tempPassword', description: 'New temporary password', example: 'Reset@4471'                  },
      { name: 'loginUrl',     description: 'Link to the login page', example: 'http://localhost:3005/login' },
    ],
  },

  {
    key: 'LEAVE_SUBMITTED_EMPLOYEE', name: 'Leave Request — Submission Confirmation',
    description: 'Sent to the employee immediately after they submit a leave request (pending or auto-approved).',
    category: 'EMPLOYEE',
    subject: '{{orgName}} — Leave Request {{submissionStatusLabel}}',
    bodyHtml: WRAP('{{orgName}}', 'Leave Management · Confirmation', `
${INTRO('Hello <strong>{{employeeName}}</strong>,<br><br>{{submissionMessage}}')}
${SECTION('Leave Details')}
${TABLE(ROW('Leave Type', '{{leaveType}}') + ROW('From', '{{fromDate}}') + ROW('To', '{{toDate}}') + ROW('Duration', '{{duration}}') + ROW('Reason', '{{reason}}', true))}
<div style="margin:0 0 24px 0;">{{statusBadge}}</div>
${BTN('View My Leaves', '{{myLeavesUrl}}')}
`),
    variables: [
      { name: 'orgName',               description: 'Organization name',                           example: 'Innovizia'         },
      { name: 'employeeName',          description: "Employee's full name",                        example: 'Priya Sharma'      },
      { name: 'submissionStatusLabel', description: 'Submitted / Auto-Approved',                   example: 'Submitted'         },
      { name: 'submissionMessage',     description: 'Contextual message based on approval policy', example: 'Your leave request has been submitted and is pending admin review.' },
      { name: 'leaveType',             description: 'Human-readable leave type',                   example: 'Sick Leave'        },
      { name: 'fromDate',              description: 'Leave start date',                            example: '15/06/2026'        },
      { name: 'toDate',                description: 'Leave end date',                              example: '17/06/2026'        },
      { name: 'duration',              description: 'Duration string',                             example: '3 working day(s)' },
      { name: 'reason',                description: 'Reason provided',                             example: 'Medical appointment and recovery.' },
      { name: 'statusBadge',           description: 'Color-coded status badge (auto-generated HTML)', example: BADGE_PENDING   },
      { name: 'myLeavesUrl',           description: 'Link to employee my-leaves page',             example: 'http://localhost:3005/employee/my-leaves' },
    ],
  },

  {
    key: 'WFH_SUBMITTED_EMPLOYEE', name: 'WFH Request — Submission Confirmation',
    description: 'Sent to the employee after they submit a WFH request (pending or auto-approved).',
    category: 'EMPLOYEE',
    subject: '{{orgName}} — WFH Request {{submissionStatusLabel}}',
    bodyHtml: WRAP('{{orgName}}', 'Leave Management · Confirmation', `
${INTRO('Hello <strong>{{employeeName}}</strong>,<br><br>{{submissionMessage}}')}
${SECTION('WFH Details')}
${TABLE(ROW('Type', 'Work From Home') + ROW('From', '{{fromDate}}') + ROW('To', '{{toDate}}') + ROW('Duration', '{{duration}}') + ROW('Reason', '{{reason}}', true))}
<div style="margin:0 0 24px 0;">{{statusBadge}}</div>
${BTN('View My WFH', '{{myLeavesUrl}}')}
`),
    variables: [
      { name: 'orgName',               description: 'Organization name',                           example: 'Innovizia'         },
      { name: 'employeeName',          description: "Employee's full name",                        example: 'Rahul Mehta'       },
      { name: 'submissionStatusLabel', description: 'Submitted / Auto-Approved',                   example: 'Submitted'         },
      { name: 'submissionMessage',     description: 'Contextual message based on approval policy', example: 'Your WFH request has been submitted and is pending admin review.' },
      { name: 'fromDate',              description: 'WFH start date',                              example: '10/06/2026'        },
      { name: 'toDate',                description: 'WFH end date',                                example: '11/06/2026'        },
      { name: 'duration',              description: 'Duration string',                             example: '2 working day(s)' },
      { name: 'reason',                description: 'Reason provided',                             example: 'Working from home for focus time.' },
      { name: 'statusBadge',           description: 'Color-coded status badge (auto-generated HTML)', example: BADGE_PENDING   },
      { name: 'myLeavesUrl',           description: 'Link to employee my-leaves page',             example: 'http://localhost:3005/employee/my-leaves' },
    ],
  },

  {
    key: 'LEAVE_STATUS_UPDATE', name: 'Leave Request — Status Update',
    description: 'Sent to the employee when their leave is approved, rejected, or when they are marked absent.',
    category: 'EMPLOYEE',
    subject: '{{orgName}} — Leave Request {{statusLabel}}',
    bodyHtml: WRAP('{{orgName}}', 'Leave Management · Status Update', `
${INTRO('Hello <strong>{{employeeName}}</strong>,<br><br>{{statusMessage}}')}
${SECTION('Leave Details')}
${TABLE(ROW('Leave Type', '{{leaveType}}') + ROW('From', '{{fromDate}}') + ROW('To', '{{toDate}}') + ROW('Duration', '{{duration}}', true))}
{{adminCommentBox}}
<div style="margin:0 0 24px 0;">{{statusBadge}}</div>
${BTN('View My Leaves', '{{myLeavesUrl}}')}
`),
    variables: [
      { name: 'orgName',         description: 'Organization name',                               example: 'Innovizia'         },
      { name: 'employeeName',    description: "Employee's full name",                            example: 'Priya Sharma'      },
      { name: 'statusLabel',     description: 'Approved / Rejected / Marked Absent',            example: 'Approved'          },
      { name: 'statusMessage',   description: 'Contextual message for the status',              example: 'Great news! Your leave request has been approved.' },
      { name: 'leaveType',       description: 'Human-readable leave type',                      example: 'Sick Leave'        },
      { name: 'fromDate',        description: 'Leave start date',                               example: '15/06/2026'        },
      { name: 'toDate',          description: 'Leave end date',                                 example: '17/06/2026'        },
      { name: 'duration',        description: 'Duration string',                                example: '3 working day(s)' },
      { name: 'adminCommentBox', description: 'Admin comment box HTML (empty string if none)',  example: SAMPLE_COMMENT      },
      { name: 'statusBadge',     description: 'Color-coded status badge (auto-generated HTML)', example: BADGE_APPROVED      },
      { name: 'myLeavesUrl',     description: 'Link to employee my-leaves page',               example: 'http://localhost:3005/employee/my-leaves' },
    ],
  },

  {
    key: 'WFH_STATUS_UPDATE', name: 'WFH Request — Status Update',
    description: 'Sent to the employee when their WFH request is approved or rejected.',
    category: 'EMPLOYEE',
    subject: '{{orgName}} — WFH Request {{statusLabel}}',
    bodyHtml: WRAP('{{orgName}}', 'Leave Management · Status Update', `
${INTRO('Hello <strong>{{employeeName}}</strong>,<br><br>{{statusMessage}}')}
${SECTION('WFH Details')}
${TABLE(ROW('Type', 'Work From Home') + ROW('From', '{{fromDate}}') + ROW('To', '{{toDate}}') + ROW('Duration', '{{duration}}', true))}
{{adminCommentBox}}
<div style="margin:0 0 24px 0;">{{statusBadge}}</div>
${BTN('View My WFH', '{{myLeavesUrl}}')}
`),
    variables: [
      { name: 'orgName',         description: 'Organization name',                               example: 'Innovizia'         },
      { name: 'employeeName',    description: "Employee's full name",                            example: 'Rahul Mehta'       },
      { name: 'statusLabel',     description: 'Approved / Rejected',                            example: 'Approved'          },
      { name: 'statusMessage',   description: 'Contextual message for the status',              example: 'Your Work From Home request has been approved.' },
      { name: 'fromDate',        description: 'WFH start date',                                 example: '10/06/2026'        },
      { name: 'toDate',          description: 'WFH end date',                                   example: '11/06/2026'        },
      { name: 'duration',        description: 'Duration string',                                example: '2 working day(s)' },
      { name: 'adminCommentBox', description: 'Admin comment box HTML (empty string if none)',  example: ''                   },
      { name: 'statusBadge',     description: 'Color-coded status badge (auto-generated HTML)', example: BADGE_APPROVED      },
      { name: 'myLeavesUrl',     description: 'Link to employee my-leaves page',               example: 'http://localhost:3005/employee/my-leaves' },
    ],
  },

  {
    key: 'ADMIN_IMPORTED_LEAVE', name: 'Leave Record Added by Admin',
    description: 'Sent to the employee when an admin manually adds a leave record on their behalf.',
    category: 'EMPLOYEE',
    subject: '{{orgName}} — A Leave Record Has Been Added to Your Account',
    bodyHtml: WRAP('{{orgName}}', 'Leave Management · Account Update', `
${INTRO('Hello <strong>{{employeeName}}</strong>,<br><br>Your administrator has added a leave record to your account. The details are shown below.')}
${SECTION('Leave Details')}
${TABLE(ROW('Leave Type', '{{leaveType}}') + ROW('From', '{{fromDate}}') + ROW('To', '{{toDate}}') + ROW('Duration', '{{duration}}') + ROW('Reason', '{{reason}}', true))}
<div style="margin:0 0 24px 0;">{{statusBadge}}</div>
${DIVIDER()}
<p style="color:${COLOR_TEXT_MUTED};font-size:13px;margin:0 0 24px 0;line-height:1.7;">This leave has been marked as approved and your balance has been updated. If you believe this is an error, please contact your HR administrator.</p>
${BTN('View My Leaves', '{{myLeavesUrl}}')}
`),
    variables: [
      { name: 'orgName',      description: 'Organization name',                              example: 'Innovizia'               },
      { name: 'employeeName', description: "Employee's full name",                           example: 'Aisha Khan'              },
      { name: 'leaveType',    description: 'Human-readable leave type',                      example: 'Transport / Weather Leave' },
      { name: 'fromDate',     description: 'Leave start date',                               example: '01/06/2026'              },
      { name: 'toDate',       description: 'Leave end date',                                 example: '01/06/2026'              },
      { name: 'duration',     description: 'Duration string',                                example: '1 working day(s)'        },
      { name: 'reason',       description: 'Reason entered by admin',                        example: 'Cyclone warning — office closed.' },
      { name: 'statusBadge',  description: 'Color-coded status badge (auto-generated HTML)', example: BADGE_APPROVED            },
      { name: 'myLeavesUrl',  description: 'Link to employee my-leaves page',               example: 'http://localhost:3005/employee/my-leaves' },
    ],
  },
];
