const ExamCategory = require('../models/ExamCategory');

// Create
exports.createCategory = async (req, res) => {
  try {
    const category = new ExamCategory(req.body);
    const saved = await category.save();
    res.status(201).json(saved);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Get All (Populated)
exports.getAllCategories = async (req, res) => {
  try {
    const categories = await ExamCategory.find()
      .populate('testSeriesGroups')
      .sort({ createdAt: -1 });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get Single
exports.getCategoryById = async (req, res) => {
  try {
    const category = await ExamCategory.findById(req.params.id);
    if (!category) return res.status(404).json({ error: 'Category not found' });
    res.json(category);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update
exports.updateCategory = async (req, res) => {
  try {
    const updated = await ExamCategory.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Delete
exports.deleteCategory = async (req, res) => {
  try {
    await ExamCategory.findByIdAndDelete(req.params.id);
    res.json({ message: 'Category deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};