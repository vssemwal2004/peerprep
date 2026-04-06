import mongoose from 'mongoose';

const ruleBlockSchema = new mongoose.Schema({
  type: { type: String, enum: ['paragraph', 'bullet'], default: 'bullet' },
  text: { type: String, required: true },
}, { _id: false });

const assessmentRuleSchema = new mongoose.Schema({
  title: { type: String, default: 'Assessment Rules' },
  blocks: { type: [ruleBlockSchema], default: [] },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.model('AssessmentRule', assessmentRuleSchema);
