import mongoose from 'mongoose';

const emailTemplateSchema = new mongoose.Schema({
  templateKey: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },
  name: { type: String, required: true, trim: true },
  subject: { type: String, required: true },
  htmlContent: { type: String, required: true },
  type: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },
  variables: [{ type: String, trim: true }],
  isSystem: { type: Boolean, default: false },
}, { timestamps: true });

emailTemplateSchema.pre('validate', function preValidate(next) {
  if (!this.templateKey && this.type) {
    this.templateKey = this.type;
  }
  next();
});

emailTemplateSchema.index({ type: 1 }, { unique: true });
emailTemplateSchema.index({ templateKey: 1 }, { unique: true });

export default mongoose.model('EmailTemplate', emailTemplateSchema);
