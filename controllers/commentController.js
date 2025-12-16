const Comment = require('../models/Comment.js');
const asyncHandler = require('express-async-handler');
const sanitizeHtml = require('sanitize-html'); 
const jwt = require('jsonwebtoken'); // ✅ Import JWT for Soft Auth
const cloudinary = require('cloudinary').v2; // ✅ 1. Import Cloudinary

// ✅ 2. Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const sanitizeConfig = {
  allowedTags: [],
  allowedAttributes: {},
};

// ✅ 3. HELPER: Extract Public ID from Cloudinary URL
const getPublicIdFromUrl = (url) => {
    try {
        if (!url) return null;
        // Cloudinary URL format: .../upload/v1234567890/folder/filename.jpg
        const splitUrl = url.split('/');
        const lastSegment = splitUrl.pop(); // filename.jpg
        const filename = lastSegment.split('.')[0]; // filename
        const folder = splitUrl.pop(); // folder (or 'upload' if no folder)
        
        // If the folder is 'upload' or a version number (v123...), it's likely root
        if (folder === 'upload' || /^v\d+$/.test(folder)) {
             return filename;
        }
        // Otherwise return folder/filename
        return `${folder}/${filename}`;
    } catch (error) {
        console.error("Error extracting public ID:", error);
        return null;
    }
};

// @desc    Get comments (Approved for all, + Pending for the author)
// @route   GET /api/comments/:postId?type=question
// @access  Public (Soft Auth)
const getCommentsForPost = asyncHandler(async (req, res) => {
  const { type } = req.query; 
  const postId = req.params.postId;

  // 1. Determine Context (Question vs Blog Post)
  let contextQuery = {};
  if (type === 'question') {
    contextQuery = { question: postId };
  } else {
    contextQuery = { post: postId };
  }

  // 2. Default Visibility: Only show Approved comments
  let visibilityQuery = { status: 'approved' };

  // 3. "Soft Auth": Check if user is logged in via cookie
  // ✅ FIX 1: Check for 'token' (which your logs show) OR 'jwt'
  const token = req.cookies.token || req.cookies.jwt; 

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // ✅ FIX 2: Check for 'id' (from your logs) OR 'userId'
      const currentUserId = decoded.id || decoded.userId;

      // ✅ LOGIC: Show Approved comments OR Pending comments belonging to ME
      visibilityQuery = {
        $or: [
          { status: 'approved' },
          { status: 'pending', user: currentUserId } 
        ]
      };
    } catch (error) {
      console.log("Soft auth failed (Invalid Token):", error.message);
    }
  }

  // 4. Combine Context and Visibility
  const finalQuery = { ...contextQuery, ...visibilityQuery };

  const comments = await Comment.find(finalQuery)
    .populate('user', 'name _id profilePicture')
    .sort({ createdAt: 'desc' });

  res.json(comments);
});

// @desc    Create a new comment (with optional images)
// @route   POST /api/comments/:postId
// @access  Private
const createComment = asyncHandler(async (req, res) => {
  // Extract 'images' and 'type' from body
  const { content, images, type } = req.body;

  if (!content) {
    res.status(400);
    throw new Error('Comment content cannot be empty.');
  }

  const sanitizedContent = sanitizeHtml(content, sanitizeConfig);

  // Setup the new comment object
  const commentData = {
    content: sanitizedContent,
    user: req.user._id,
    status: 'pending',
    images: images || [], // Save the image URLs
  };

  // Link to either Question or Post based on type
  if (type === 'question') {
    commentData.question = req.params.postId;
  } else {
    commentData.post = req.params.postId;
  }

  const comment = new Comment(commentData);

  const createdComment = await comment.save();
  const populatedComment = await Comment.findById(createdComment._id).populate('user', 'name _id profilePicture');

  res.status(201).json(populatedComment);
});

// @desc    Update a user's own comment
// @route   PUT /api/comments/:id
// @access  Private
const updateComment = asyncHandler(async (req, res) => {
  const { content, images } = req.body; 
  const comment = await Comment.findById(req.params.id);

  if (!comment) {
    res.status(404);
    throw new Error('Comment not found');
  }

  if (comment.user.toString() !== req.user._id.toString()) {
    res.status(401);
    throw new Error('User not authorized to update this comment');
  }

  const sanitizedContent = sanitizeHtml(content, sanitizeConfig);

  // 1. Identify Changed Images
  const currentImages = comment.images || [];
  const newImages = images || [];
  
  const imagesChanged = 
    currentImages.length !== newImages.length || 
    !currentImages.every((img, i) => img === newImages[i]);

  // ✅ 2. FIX: Delete Removed Images from Cloudinary
  if (imagesChanged) {
      // Find images that were in the DB (currentImages) but are NOT in the new request (newImages)
      const imagesToDelete = currentImages.filter(img => !newImages.includes(img));
      
      if (imagesToDelete.length > 0) {
          console.log(`Deleting ${imagesToDelete.length} replaced/removed images from Cloudinary.`);
          for (const imgUrl of imagesToDelete) {
              const publicId = getPublicIdFromUrl(imgUrl);
              if (publicId) {
                  try {
                      await cloudinary.uploader.destroy(publicId);
                  } catch (err) {
                      console.error("Cloudinary Delete Error:", err);
                  }
              }
          }
      }
  }

  // 3. Update Database
  if (sanitizedContent !== comment.content || imagesChanged) {
      comment.content = sanitizedContent;
      if (images) comment.images = images; 
      comment.status = 'pending'; 
  }
  
  const updatedComment = await comment.save();
  
  const populatedComment = await Comment.findById(updatedComment._id)
    .populate('user', 'name _id profilePicture');

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

  if (comment.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    res.status(401);
    throw new Error('User not authorized to delete this comment');
  }

  // ✅ 4. CLEANUP: Delete Images from Cloudinary before deleting comment
  if (comment.images && comment.images.length > 0) {
      for (const imgUrl of comment.images) {
          const publicId = getPublicIdFromUrl(imgUrl);
          if (publicId) {
              try {
                  await cloudinary.uploader.destroy(publicId);
              } catch (err) {
                  console.error("Failed to delete image from Cloudinary:", err);
              }
          }
      }
  }

  await comment.deleteOne();
  res.json({ message: 'Comment removed' });
});

// @desc    (NEW) Delete an image directly (e.g. User cancels upload)
// @route   POST /api/comments/delete-image
// @access  Private
const deleteImageFile = asyncHandler(async (req, res) => {
    const { imageUrl } = req.body;
    
    if (!imageUrl) {
        res.status(400);
        throw new Error('No image URL provided');
    }

    const publicId = getPublicIdFromUrl(imageUrl);
    if (publicId) {
        try {
            await cloudinary.uploader.destroy(publicId);
            res.json({ message: 'Image deleted from cloud' });
        } catch (error) {
            console.error("Cloudinary Delete Error:", error);
            res.status(500);
            throw new Error('Failed to delete image from cloud');
        }
    } else {
        res.status(400);
        throw new Error('Invalid image URL');
    }
});

// @desc    (ADMIN) Get all pending comments
// @route   GET /api/comments/admin/pending
// @access  Private/Admin
const getPendingComments = asyncHandler(async (req, res) => {
    const comments = await Comment.find({ 
        status: { $in: ['pending', 'approved'] } 
    })
      .populate('user', 'name profilePicture') 
      .populate('post', 'title slug') 
      .populate('question') 
      .sort({ createdAt: 'desc' }); // Newest first
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
  deleteImageFile, // ✅ Exported new function
  getPendingComments,
  approveComment,
};