import mongoose from 'mongoose';

const MASTER_DATA_CATEGORIES = ['campus', 'branch', 'semester', 'course'];

const masterDataSchema = new mongoose.Schema({
  category: {
    type: String,
    enum: MASTER_DATA_CATEGORIES,
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120,
  },
  normalizedName: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  },
  code: {
    type: String,
    trim: true,
    maxlength: 40,
    default: '',
  },
  order: {
    type: Number,
    default: 0,
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, { timestamps: true });

masterDataSchema.index({ category: 1, normalizedName: 1 }, { unique: true });
masterDataSchema.index({ category: 1, isActive: 1, order: 1, name: 1 });

masterDataSchema.pre('validate', function normalizeMasterData() {
  this.name = String(this.name || '').trim().replace(/\s+/g, ' ');
  this.normalizedName = this.name.toLowerCase();
  this.code = String(this.code || '').trim().toUpperCase();
  if (this.category === 'semester') {
    const semester = Number(this.name.replace(/^semester\s*/i, ''));
    if (!Number.isInteger(semester) || semester < 1 || semester > 8) {
      this.invalidate('name', 'Semester must be an integer between 1 and 8.');
    } else {
      this.name = String(semester);
      this.normalizedName = String(semester);
      this.order = semester;
      if (!this.code) this.code = `SEM${semester}`;
    }
  }
});

export { MASTER_DATA_CATEGORIES };
export default mongoose.model('MasterData', masterDataSchema);
