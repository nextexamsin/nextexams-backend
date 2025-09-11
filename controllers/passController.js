
import PassPurchase from '../models/PassPurchase.js';
import User from '../models/User.js';
import addDuration from '../utils/addDuration.js';


export const purchasePass = async (req, res) => {
  const { duration } = req.body;
  const userId = req.user._id;

  const newExpiry = addDuration(req.user.passExpiry || new Date(), duration);

  const purchase = new PassPurchase({ userId, duration, expiryDate: newExpiry  });
  await purchase.save();

  await User.findByIdAndUpdate(userId, { passExpiry: newExpiry });

  res.json({ message: 'Pass purchased successfully', expiresAt: newExpiry });
};

export const checkPassAccess = async (req, res) => {
  const user = await User.findById(req.params.userId);
  const hasAccess = user?.passExpiry && new Date(user.passExpiry) > new Date();
  res.json({ hasAccess });
};




export const getPassHistory = async (req, res) => {
  const userId = req.user._id;
  const passes = await PassPurchase.find({ userId }).sort({ purchasedAt: -1 });
  res.json(passes);
};