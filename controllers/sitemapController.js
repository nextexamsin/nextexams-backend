const { SitemapStream, streamToPromise } = require('sitemap');
const BlogPost = require('../models/BlogPost'); 
const ExamCategory = require('../models/ExamCategory'); 

exports.getSitemap = async (req, res) => {
  try {
    const smStream = new SitemapStream({ hostname: 'https://www.nextexams.in' });

    // 1. Add Static Pages
    const staticPages = [
      { url: '/', changefreq: 'daily', priority: 1.0 },
      { url: '/login', changefreq: 'monthly', priority: 0.7 },
      { url: '/about', changefreq: 'monthly', priority: 0.7 },
      { url: '/contact', changefreq: 'monthly', priority: 0.6 },
      { url: '/faq', changefreq: 'monthly', priority: 0.6 },
      { url: '/test-series', changefreq: 'daily', priority: 0.9 },
      { url: '/blog', changefreq: 'daily', priority: 0.9 },
      { url: '/books', changefreq: 'weekly', priority: 0.8 },
      { url: '/privacy-policy', changefreq: 'yearly', priority: 0.3 },
      { url: '/terms-and-conditions', changefreq: 'yearly', priority: 0.3 },
    ];

    staticPages.forEach(page => smStream.write(page));

    // 2. Dynamic: Blog Posts
    // ✅ FILTER: Only show active, published posts (Hide deleted ones)
    const blogs = await BlogPost.find({ 
        status: 'published', 
        isDeleted: false 
    }).select('slug updatedAt createdAt');

    blogs.forEach(post => {
        if (post.slug) {
            smStream.write({
                url: `/blog/${post.slug}`,
                lastmod: post.updatedAt || post.createdAt, 
                changefreq: 'weekly',
                priority: 0.8
            });
        }
    });

    // 3. Dynamic: Exam Categories
    const categories = await ExamCategory.find({}).select('slug updatedAt createdAt');
    categories.forEach(cat => {
      if (cat.slug) {
          smStream.write({
            url: `/test-series?category=${cat.slug}`,
            lastmod: cat.updatedAt || cat.createdAt,
            changefreq: 'weekly',
            priority: 0.8
          });
      }
    });

    // 4. Finalize
    smStream.end();
    const sitemap = await streamToPromise(smStream);

    res.header('Content-Type', 'application/xml');
    res.send(sitemap);

  } catch (error) {
    console.error("❌ Sitemap Generation Error:", error);
    res.status(500).end();
  }
};