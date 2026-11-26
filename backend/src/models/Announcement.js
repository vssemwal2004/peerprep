import { tenantModel } from '../platform/tenantContext.js';
import mongoose from 'mongoose';
import { ANNOUNCEMENT_CATEGORIES, ANNOUNCEMENT_DESIGNS, ANNOUNCEMENT_THEMES } from '../services/announcementContent.js';

const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  // Plain text (bars, cards, notification bell). Set from messageHtml when content is formatted.
  message: { type: String, required: true, trim: true },
  // Formatted content (headings, paragraphs, colours), sanitised on the server (announcementContent.js).
  messageHtml: { type: String, default: '' },
  // Legacy three-value type, kept in step with `category` for older screens.
  type: { type: String, enum: ['motivation', 'info', 'alert'], default: 'motivation' },
  // What students see it called (Notice, Exam, Placement ...); `label` overrides the name.
  category: { type: String, enum: ANNOUNCEMENT_CATEGORIES, default: 'announcement' },
  label: { type: String, default: '', trim: true, maxlength: 24 },
  // Popup layout and colour.
  design: { type: String, enum: ANNOUNCEMENT_DESIGNS, default: 'classic' },
  theme: { type: String, enum: ANNOUNCEMENT_THEMES, default: 'sky' },
  imageUrl: { type: String, default: '' },
  imageAlt: { type: String, default: '' },
  // Optional button (http(s) link or a PeerPrep page).
  ctaLabel: { type: String, default: '' },
  ctaUrl: { type: String, default: '' },
  status: { type: String, enum: ['active', 'inactive'], default: 'inactive' },
  priority: { type: String, enum: ['high', 'normal', 'low'], default: 'normal' },
  // Also shown as a popup to students right after they log in (once per login).
  showAsPopup: { type: Boolean, default: false },
  // Who sees it: every student, or only the chosen students (services/announcementAudience.js).
  audience: { type: String, enum: ['all', 'selected'], default: 'all' },
  studentIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  expiryDate: { type: Date }
}, { timestamps: true });

announcementSchema.index({ status: 1, expiryDate: 1 });
announcementSchema.index({ priority: 1, createdAt: -1 });
announcementSchema.index({ studentIds: 1 });

export default tenantModel(mongoose.model('Announcement', announcementSchema));
