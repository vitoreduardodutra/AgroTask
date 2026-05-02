const express = require('express');
const authRoutes = require('./authRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const taskRoutes = require('./taskRoutes');
const farmRoutes = require('./farmRoutes');
const notificationRoutes = require('./notificationRoutes');
const reportRoutes = require('./reportRoutes');

const router = express.Router();

router.get('/', (req, res) => {
  return res.json({
    message: 'API AgroTask ativa',
  });
});

router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/tasks', taskRoutes);
router.use('/farms', farmRoutes);
router.use('/notifications', notificationRoutes);
router.use('/reports', reportRoutes);

module.exports = router;
