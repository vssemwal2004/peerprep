import EmailTemplate from '../models/EmailTemplate.js';
import { HttpError } from '../utils/errors.js';
import { isValidObjectId, sanitizeSearchQuery } from '../middleware/sanitization.js';
import { logActivity } from './adminActivityController.js';

export async function listEmailTemplates(req, res) {
  const search = sanitizeSearchQuery(req.query.search || '');
  const query = search
    ? {
        $or: [
          { name: new RegExp(search, 'i') },
          { subject: new RegExp(search, 'i') },
          { type: new RegExp(search, 'i') },
        ],
      }
    : {};

  const templates = await EmailTemplate.find(query)
    .select('name subject type updatedAt isSystem variables')
    .sort({ name: 1 })
    .lean();

  res.json(templates);
}

export async function getEmailTemplate(req, res) {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw new HttpError(400, 'Invalid template id');
  const template = await EmailTemplate.findById(id).lean();
  if (!template) throw new HttpError(404, 'Email template not found');
  res.json(template);
}

export async function createEmailTemplate(req, res) {
  const { name, subject, htmlContent, type, variables } = req.body || {};
  if (!name || !subject || !htmlContent || !type) {
    throw new HttpError(400, 'Name, subject, htmlContent, and type are required');
  }
  const payload = {
    name: String(name).trim(),
    subject: String(subject),
    htmlContent: String(htmlContent),
    type: String(type).trim().toUpperCase(),
    variables: Array.isArray(variables) ? variables.map(v => String(v).trim()) : [],
    isSystem: false,
  };

  const exists = await EmailTemplate.findOne({ type: payload.type }).select('_id').lean();
  if (exists) throw new HttpError(409, 'Template type already exists');

  const created = await EmailTemplate.create(payload);

  logActivity({
    userEmail: req.user?.email,
    userRole: req.user?.role,
    actionType: 'CREATE',
    targetType: 'EMAIL_TEMPLATE',
    targetId: String(created._id),
    description: `Created email template: ${created.name} (${created.type})`,
    changes: {
      name: { from: null, to: created.name },
      type: { from: null, to: created.type },
    },
    metadata: { templateId: String(created._id), type: created.type },
    req,
  });

  res.status(201).json(created);
}

export async function updateEmailTemplate(req, res) {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw new HttpError(400, 'Invalid template id');

  const template = await EmailTemplate.findById(id);
  if (!template) throw new HttpError(404, 'Email template not found');

  const before = {
    name: template.name,
    subject: template.subject,
    htmlContent: template.htmlContent,
    type: template.type,
    variables: Array.isArray(template.variables) ? [...template.variables] : [],
  };

  const { name, subject, htmlContent, type, variables } = req.body || {};

  if (name !== undefined) template.name = String(name).trim();
  if (subject !== undefined) template.subject = String(subject);
  if (htmlContent !== undefined) template.htmlContent = String(htmlContent);

  if (type !== undefined) {
    const nextType = String(type).trim().toUpperCase();
    if (template.isSystem && nextType !== template.type) {
      throw new HttpError(400, 'Cannot change type of system template');
    }
    template.type = nextType;
  }

  if (variables !== undefined) {
    template.variables = Array.isArray(variables) ? variables.map(v => String(v).trim()) : [];
  }

  await template.save();

  const after = {
    name: template.name,
    subject: template.subject,
    htmlContent: template.htmlContent,
    type: template.type,
    variables: Array.isArray(template.variables) ? [...template.variables] : [],
  };
  const changes = {};
  Object.keys(after).forEach((k) => {
    const from = before[k];
    const to = after[k];
    if (JSON.stringify(from) !== JSON.stringify(to)) changes[k] = { from, to };
  });

  logActivity({
    userEmail: req.user?.email,
    userRole: req.user?.role,
    actionType: 'UPDATE',
    targetType: 'EMAIL_TEMPLATE',
    targetId: String(template._id),
    description: `Updated email template: ${template.name} (${template.type})`,
    changes: Object.keys(changes).length ? changes : null,
    metadata: { templateId: String(template._id), type: template.type },
    req,
  });

  res.json(template);
}

export async function deleteEmailTemplate(req, res) {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw new HttpError(400, 'Invalid template id');

  const template = await EmailTemplate.findById(id);
  if (!template) throw new HttpError(404, 'Email template not found');
  if (template.isSystem) throw new HttpError(400, 'System templates cannot be deleted');

  await template.deleteOne();

  logActivity({
    userEmail: req.user?.email,
    userRole: req.user?.role,
    actionType: 'DELETE',
    targetType: 'EMAIL_TEMPLATE',
    targetId: String(template._id),
    description: `Deleted email template: ${template.name} (${template.type})`,
    metadata: { templateId: String(template._id), type: template.type },
    req,
  });

  res.json({ ok: true });
}
