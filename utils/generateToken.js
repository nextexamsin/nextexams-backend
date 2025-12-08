const jwt = require("jsonwebtoken");

const generateToken = (res, user) => {
  const token = jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "30d",
    }
  );

  // Set the cookie for SSO
  res.cookie('jwt', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // Use secure in production
    sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'lax', // Lax is required for subdomain sharing
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    // 👇 CRITICAL: This allows 'tool.nextexams.in' to read the cookie set by 'nextexams.in'
    domain: process.env.NODE_ENV === 'production' ? '.nextexams.in' : undefined 
  });

  return token; // We still return it in case your Main Frontend uses it
};

module.exports = generateToken;