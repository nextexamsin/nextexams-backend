const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  content: {
    type: String,
    required: true,
    trim: true,
  },
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BlogPost',
    required: false, // CHANGED: Made optional so we can use 'question' instead
  },
  // NEW: Link to Question entity
  question: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    required: false,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // NEW: Array to store Cloudinary Image URLs
  images: [{
    type: String,
  }],
  status: {
    type: String,
    enum: ['pending', 'approved', 'spam'],
    default: 'pending',
  },
}, {
  timestamps: true,
});

// NEW: Validation to ensure a comment belongs to SOMETHING (Post OR Question)
commentSchema.pre('validate', function(next) {
  if (!this.post && !this.question) {
    next(new Error('Comment must be associated with either a Post or a Question'));
  } else {
    next();
  }
});

const Comment = mongoose.model('Comment', commentSchema);

module.exports = Comment;