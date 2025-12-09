const jwt = require("jsonwebtoken");

const generateToken = (res, user) => {
  const userId = user._id || user.id; // Handle both object and direct ID

  const token = jwt.sign(
    {
      id: userId,
      email: user.email,
      role: user.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "30d",
    }
  );

  // CRITICAL: We force the environment to 'production' check or default to secure for your setup
  const isProduction = process.env.NODE_ENV === 'production';

  // 1. Clear any old cookies with the WRONG name ('jwt') just in case
  res.clearCookie('jwt', { domain: '.nextexams.in' });

  // 2. Set the new Shared Cookie with the CORRECT name ('token')
  res.cookie('token', token, {
    httpOnly: true,
    secure: true,        // Always True for HTTPS (Render/Vercel)
    sameSite: 'none',    // Required for Cross-Site (api. to www.)
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    domain: '.nextexams.in' // Explicitly set for all subdomains
  });

  return token;
};

module.exports = generateToken;