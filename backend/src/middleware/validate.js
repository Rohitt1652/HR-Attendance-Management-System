const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate({ ...req.body, ...req.query }, { abortEarly: false });
  if (error) {
    const errors = error.details.map((d) => ({
      field: d.path.join('.'),
      message: d.message,
    }));
    return res.status(400).json({ success: false, message: 'Validation failed', errors });
  }
  next();
};

module.exports = validate;
