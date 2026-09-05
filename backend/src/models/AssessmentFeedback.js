import mongoose from 'mongoose';

const assessmentFeedbackSchema = new mongoose.Schema({
  assessmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Assessment',
    required: true,
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
    validate: {
      validator: Number.isInteger,
      message: 'Rating must be a whole number from 1 to 5.',
    },
  },
  comments: {
    type: String,
    trim: true,
    maxlength: 2000,
    default: '',
  },
}, { timestamps: true });

assessmentFeedbackSchema.index({ assessmentId: 1, studentId: 1 }, { unique: true });
assessmentFeedbackSchema.index({ assessmentId: 1, createdAt: -1 });
assessmentFeedbackSchema.index({ studentId: 1, createdAt: -1 });

export default mongoose.model('AssessmentFeedback', assessmentFeedbackSchema);
