const Comment = require('../models/Comment.js');
const asyncHandler = require('express-async-handler');
const sanitizeHtml = require('sanitize-html'); // Import the sanitizer

// --- UTILITY: Configure the sanitizer to strip all HTML ---
const sanitizeConfig = {
  allowedTags: [],
  allowedAttributes: {},
};

// @desc    Get all approved comments for a post
// @route   GET /api/comments/:postId
// @access  Public
const getCommentsForPost = asyncHandler(async (req, res) => {
  // We only fetch comments that have been approved
  const comments = await Comment.find({ post: req.params.postId, status: 'approved' })
    .populate('user', 'name')
    .sort({ createdAt: 'desc' });

  res.json(comments);
});

// @desc    Create a new comment on a post
// @route   POST /api/comments/:postId
// @access  Private
const createComment = asyncHandler(async (req, res) => {
  const { content } = req.body;

  if (!content) {
    res.status(400);
    throw new Error('Comment content cannot be empty.');
  }

  // --- SECURITY: Sanitize user input to remove all HTML tags ---
  const sanitizedContent = sanitizeHtml(content, sanitizeConfig);

  const comment = new Comment({
    content: sanitizedContent,
    post: req.params.postId,
    user: req.user._id,
    status: 'pending', // All new comments are pending approval
  });

  const createdComment = await comment.save();
  const populatedComment = await Comment.findById(createdComment._id).populate('user', 'name');

  res.status(201).json(populatedComment);
});

// @desc    Update a user's own comment
// @route   PUT /api/comments/:id
// @access  Private
const updateComment = asyncHandler(async (req, res) => {
  const { content } = req.body;
  const comment = await Comment.findById(req.params.id);

  if (!comment) {
    res.status(404);
    throw new Error('Comment not found');
  }

  // --- SECURITY: Check if the user owns the comment ---
  if (comment.user.toString() !== req.user._id.toString()) {
    res.status(401);
    throw new Error('User not authorized to update this comment');
  }

  const sanitizedContent = sanitizeHtml(content, sanitizeConfig);
  comment.content = sanitizedContent || comment.content;
  
  const updatedComment = await comment.save();
  const populatedComment = await Comment.findById(updatedComment._id).populate('user', 'name');

  res.json(populatedComment);
});

// @desc    Delete a user's own comment
// @route   DELETE /api/comments/:id
// @access  Private
const deleteComment = asyncHandler(async (req, res) => {
  const comment = await Comment.findById(req.params.id);

  if (!comment) {
    res.status(404);
    throw new Error('Comment not found');
  }

  // --- SECURITY: User can delete their own comment, or an admin can delete any comment ---
  if (comment.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    res.status(401);
    throw new Error('User not authorized to delete this comment');
  }

  await comment.deleteOne();
  res.json({ message: 'Comment removed' });
});

// @desc    (ADMIN) Get all pending comments
// @route   GET /api/comments/admin/pending
// @access  Private/Admin
const getPendingComments = asyncHandler(async (req, res) => {
    const comments = await Comment.find({ status: 'pending' })
      .populate('user', 'name')
      .populate('post', 'title') // also show which post it's on
      .sort({ createdAt: 'asc' });
    res.json(comments);
});

// @desc    (ADMIN) Approve a comment
// @route   PUT /api/comments/admin/approve/:id
// @access  Private/Admin
const approveComment = asyncHandler(async (req, res) => {
    const comment = await Comment.findById(req.params.id);
    if (comment) {
        comment.status = 'approved';
        await comment.save();
        res.json({ message: 'Comment approved' });
    } else {
        res.status(404);
        throw new Error('Comment not found');
    }
});

module.exports = {
  getCommentsForPost,
  createComment,
  updateComment,
  deleteComment,
  getPendingComments,
  approveComment,
};