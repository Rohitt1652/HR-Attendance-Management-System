const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    employeeId: { type: String, unique: true },
    biometricId: { type: String, unique: true, sparse: true, trim: true },
    name: { type: String, required: true },
    email: { type: String, unique: true, sparse: true, lowercase: true },
    password: { type: String, required: true },
    phone: { type: String },
    department: { type: String },
    designation: { type: String },
    role: { type: String, default: 'employee' },
    teamLeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // who approves this employee's leaves
    joiningDate: { type: Date },
    dateOfBirth: { type: Date },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    profilePhotoUrl: { type: String },
    shiftId: { type: mongoose.Schema.Types.ObjectId },
    basicSalary: { type: Number, default: 0 },
    hra: { type: Number, default: 0 },
    allowances: { type: Number, default: 0 },
    deductions: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Auto-generate employeeId before save
userSchema.pre('save', async function (next) {
  if (this.employeeId) return next();
  const count = await mongoose.model('User').countDocuments();
  this.employeeId = `EMP-${String(count + 1).padStart(4, '0')}`;
  next();
});

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

userSchema.statics.generateEmployeeId = async function () {
  const count = await this.countDocuments();
  return `EMP-${String(count + 1).padStart(4, '0')}`;
};

module.exports = mongoose.model('User', userSchema);
