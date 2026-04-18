const express = require('express');
const {
  listTasks,
  getTaskFormOptions,
  createTask,
  getTaskById,
  updateTask,
  reviewTaskCompletion,
  uploadTaskEvidence,
  deleteTaskEvidence,
  deleteTask,
} = require('../controllers/taskController');
const authMiddleware = require('../middlewares/authMiddleware');
const uploadEvidence = require('../middlewares/uploadEvidence');
const { requireAdmin } = require('../middlewares/roleMiddleware');

const router = express.Router();

router.get('/form-options', authMiddleware, requireAdmin, getTaskFormOptions);
router.get('/:id', authMiddleware, getTaskById);
router.get('/', authMiddleware, listTasks);
router.post('/', authMiddleware, requireAdmin, createTask);
router.put('/:id', authMiddleware, updateTask);
router.post('/:id/review-completion', authMiddleware, requireAdmin, reviewTaskCompletion);
router.post(
  '/:id/evidences',
  authMiddleware,
  uploadEvidence.single('file'),
  uploadTaskEvidence
);
router.delete(
  '/:id/evidences/:evidenceId',
  authMiddleware,
  deleteTaskEvidence
);
router.delete('/:id', authMiddleware, deleteTask);

module.exports = router;