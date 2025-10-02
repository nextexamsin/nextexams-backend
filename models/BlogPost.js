const mongoose = require('mongoose');
const slugify = require('slugify');
const crypto = require('crypto'); // NEW: Import crypto for generating unique suffixes

const blogPostSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  slug: {
    type: String,
    unique: true, 
  },
  description: { type: String, required: true },
  imageUrl: { type: String, required: true },
  content: { type: mongoose.Schema.Types.Mixed, required: true },
  category: {
    type: String,
    enum: ['Exam Strategy', 'Syllabus', 'Exam Pattern', 'News', 'Other'],
    default: 'Other',
  },
  tags: [String],
  metaTitle: String,
  metaDescription: String,
  keywords: [String],
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  status: {
    type: String,
    enum: ['draft', 'published'],
    default: 'draft',
  },
  publishedAt: Date,
  views: { type: Number, default: 0 },
  likes: { type: Number, default: 0 },
  isDeleted: { type: Boolean, default: false },
}, {
  timestamps: true,
});

// --- CHANGED: Upgraded the pre-save hook to handle slug collisions ---
blogPostSchema.pre('save', async function(next) { // Made the function async
  // Only run if the title is modified or if it's a new post
  if (this.isModified('title') || this.isNew) {
    const baseSlug = slugify(this.title, { 
      lower: true,
      strict: true,
      remove: /[*+~.()'"!:@]/g
    });
    
    let slug = baseSlug;
    let existingPost = await this.constructor.findOne({ slug });

    // This loop checks if a post with the same slug already exists.
    // If it does, it adds a random suffix and checks again, ensuring uniqueness.
    while (existingPost && existingPost._id.toString() !== this._id.toString()) {
      const randomSuffix = crypto.randomBytes(3).toString('hex');
      slug = `${baseSlug}-${randomSuffix}`;
      existingPost = await this.constructor.findOne({ slug });
    }
    this.slug = slug;
  }
  next();
});

blogPostSchema.index({ title: 'text', description: 'text', content: 'text' });

const BlogPost = mongoose.model('BlogPost', blogPostSchema);

module.exports = BlogPost;