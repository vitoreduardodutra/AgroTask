const express = require('express');
const {
  exportTaskReport,
  exportEvidenceReport,
} = require('../controllers/reportController');
const authMiddleware = require('../middlewares/authMiddleware');
const { requireAdmin } = require('../middlewares/roleMiddleware');

const router = express.Router();

router.get('/tasks/export', authMiddleware, requireAdmin, exportTaskReport);
router.get('/evidences/export', authMiddleware, requireAdmin, exportEvidenceReport);

module.exports = router;
