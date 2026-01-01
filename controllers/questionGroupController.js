// backend/controllers/questionGroupController.js
import QuestionGroup from '../models/QuestionGroup.js';

export const createGroup = async (req, res) => {
  try {
    const group = await QuestionGroup.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json(group);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const getGroups = async (req, res) => {
  try {
    const groups = await QuestionGroup.find().sort({ createdAt: -1 });
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteGroup = async (req, res) => {
  try {
    await QuestionGroup.findByIdAndDelete(req.params.id);
    res.json({ message: 'Group deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};