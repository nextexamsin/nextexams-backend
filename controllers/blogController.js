const BlogPost = require('../models/BlogPost.js');
const asyncHandler = require('express-async-handler');

// =============================================
//               PUBLIC ACCESS
// =============================================

const getPublishedPosts = asyncHandler(async (req, res) => {
  const pageSize = 10;
  const page = Number(req.query.pageNumber) || 1;
  const count = await BlogPost.countDocuments({ status: 'published', isDeleted: false });
  const posts = await BlogPost.find({ status: 'published', isDeleted: false })
    .sort({ publishedAt: -1 })
    .limit(pageSize)
    .skip(pageSize * (page - 1));
  res.json({ posts, page, pages: Math.ceil(count / pageSize) });
});

const getPostBySlug = asyncHandler(async (req, res) => {
  const post = await BlogPost.findOne({ slug: req.params.slug, status: 'published', isDeleted: false });
  if (post) {
    BlogPost.updateOne({ _id: post._id }, { $inc: { views: 1 } }).exec();
    res.json(post);
  } else {
    res.status(404);
    throw new Error('Post not found');
  }
});

const getPopularPosts = asyncHandler(async (req, res) => {
  const posts = await BlogPost.find({ status: 'published', isDeleted: false })
    .sort({ views: -1 })
    .limit(5)
    .select('title slug');
  res.json(posts);
});

const getAllCategories = asyncHandler(async (req, res) => {
  const categories = await BlogPost.distinct('category', { 
    status: 'published', 
    isDeleted: false 
  });
  res.json(categories);
});

const searchPosts = asyncHandler(async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ message: 'Search query is required' });
  }
  const posts = await BlogPost.find(
    { $text: { $search: query }, isDeleted: false, status: 'published' },
    { score: { $meta: 'textScore' } }
  ).sort({ score: { $meta: 'textScore' } });
  res.json(posts);
});

// --- NEW FUNCTION ---
// @desc    Get related posts based on category
// @route   GET /api/blog/related/:slug
// @access  Public
const getRelatedPosts = asyncHandler(async (req, res) => {
    const currentPost = await BlogPost.findOne({ slug: req.params.slug });
    if (!currentPost) {
        return res.json([]); // Return empty array if post not found
    }
    // Find 2 other posts in the same category, excluding the current one
    const relatedPosts = await BlogPost.find({
        category: currentPost.category,
        status: 'published',
        isDeleted: false,
        _id: { $ne: currentPost._id } // $ne means "not equal to"
    })
    .sort({ publishedAt: -1 })
    .limit(2) // Limit to 2 related posts for the grid
    .select('title slug imageUrl description category');
    res.json(relatedPosts);
});


// =============================================
//                ADMIN ACCESS
// =============================================

const createPost = asyncHandler(async (req, res) => {
  const { title, description, imageUrl, content, category, status, tags, metaTitle, metaDescription, keywords } = req.body;
  const post = new BlogPost({
    title, description, imageUrl, content, category, status, tags,
    metaTitle, metaDescription, keywords,
    author: req.user._id,
    publishedAt: status === 'published' ? new Date() : null,
  });
  const createdPost = await post.save();
  res.status(201).json(createdPost);
});

const updatePost = asyncHandler(async (req, res) => {
  const { title, description, imageUrl, content, category, status, tags, metaTitle, metaDescription, keywords } = req.body;
  const post = await BlogPost.findById(req.params.id);
  if (post) {
    if (status === 'published' && post.status === 'draft') {
      post.publishedAt = new Date();
    }
    post.title = title || post.title;
    post.description = description || post.description;
    post.imageUrl = imageUrl || post.imageUrl;
    post.content = content || post.content;
    post.category = category || post.category;
    post.status = status || post.status;
    post.tags = tags || post.tags;
    post.metaTitle = metaTitle || post.metaTitle;
    post.metaDescription = metaDescription || post.metaDescription;
    post.keywords = keywords || post.keywords;
    const updatedPost = await post.save();
    res.json(updatedPost);
  } else {
    res.status(404);
    throw new Error('Post not found');
  }
});

const deletePost = asyncHandler(async (req, res) => {
  const post = await BlogPost.findById(req.params.id);
  if (post) {
    post.isDeleted = true;
    await post.save();
    res.json({ message: 'Post removed successfully' });
  } else {
    res.status(404);
    throw new Error('Post not found');
  }
});

const getAllPostsAsAdmin = asyncHandler(async (req, res) => {
  const posts = await BlogPost.find({ isDeleted: false }).sort({ createdAt: -1 });
  res.json(posts);
});

const getPostByIdForAdmin = asyncHandler(async (req, res) => {
    const post = await BlogPost.findById(req.params.id);

    if (post) {
        res.json(post);
    } else {
        res.status(404);
        throw new Error('Post not found');
    }
});

// --- CHANGED: Added getRelatedPosts to the export list ---
module.exports = {
  getPublishedPosts,
  getPostBySlug,
  createPost,
  updatePost,
  deletePost,
  getAllPostsAsAdmin,
  getPopularPosts,
  getAllCategories,
  searchPosts,
  getRelatedPosts,
  getPostByIdForAdmin
};