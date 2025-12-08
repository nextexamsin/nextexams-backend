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

  const isProduction = process.env.NODE_ENV === 'production';

  // 1. Clear potential conflicting cookies (Host-only version)
  res.clearCookie('jwt', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax'
  });

  // 2. Set the new Shared Cookie
  res.cookie('jwt', token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    domain: isProduction ? '.nextexams.in' : undefined 
  });

  return token;
};

module.exports = generateToken;