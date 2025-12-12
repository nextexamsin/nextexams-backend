const jwt = require("jsonwebtoken");

const generateToken = (res, user) => {
  const userId = user._id || user.id;

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

  // Determine environment
  const isProduction = process.env.NODE_ENV === 'production';

  // 1. Clear any potential conflicting cookies
  // We try clearing both the root domain (prod) and the default domain (localhost)
  res.clearCookie('token', { domain: '.nextexams.in' });
  res.clearCookie('token'); 

  // 2. Set the Cookie
  res.cookie('token', token, {
    httpOnly: true, // Always true (JS cannot read it)
    
    // SECURITY SETTINGS:
    // In Production (HTTPS): We MUST use secure: true and sameSite: 'none' for cross-subdomain.
    // In Localhost (HTTP): We MUST use secure: false and sameSite: 'lax' or the browser blocks it.
    secure: isProduction, 
    sameSite: isProduction ? 'none' : 'lax',
    
    // DOMAIN SETTINGS:
    // In Production: Explicitly set .nextexams.in to share between subdomains.
    // In Localhost: Leave undefined so it defaults to 'localhost'.
    domain: isProduction ? '.nextexams.in' : undefined,
    
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });

  return token;
};

module.exports = generateToken;