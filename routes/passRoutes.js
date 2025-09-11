const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { purchasePass, checkPassAccess, getPassHistory } = require('../controllers/passController');

const router = express.Router();

router.post('/purchase', protect, purchasePass);
router.get('/access/:userId', protect, checkPassAccess);
router.get('/history', protect, getPassHistory);

router.get('/me', protect, async (req, res) => {
  try {
    const user = req.user;
    if (!user.passExpiry) {
      return res.json({ active: false });
    }

    const now = new Date();
    const isActive = new Date(user.passExpiry) > now;

    res.json({
      active: isActive,
      expiresAt: user.passExpiry,
    });
  } catch (err) {
    console.error('Error in /me:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


module.exports = router;
