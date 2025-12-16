const express = require('express');
const router = express.Router();
const aiContentController = require('../controllers/ai_content.controller');

// Tạo project mới
router.post('/projects', aiContentController.createProject.bind(aiContentController));

// Phân tích Search Intent
router.post('/projects/:id/search-intent', aiContentController.analyzeSearchIntent.bind(aiContentController));

// Lấy thông tin project
router.get('/projects/:id', aiContentController.getProject.bind(aiContentController));

// List tất cả projects
router.get('/projects', aiContentController.listProjects.bind(aiContentController));

// Xóa project
router.delete('/projects/:id', aiContentController.deleteProject.bind(aiContentController));

module.exports = router;