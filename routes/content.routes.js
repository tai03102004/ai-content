const express = require('express');
const router = express.Router();
const contentController = require('../controllers/content.controller');

// POST /api/contents/from-outline/:outline_id - Generate from outline
router.post('/from-outline/:outline_id', contentController.generateFromOutline);

// POST /api/contents/standalone - Create standalone content
router.post('/standalone', contentController.createStandaloneContent);

// GET /api/contents/:id - Get content
router.get('/:id', contentController.getContent);

// GET /api/contents - List contents
router.get('/', contentController.listContents);

// DELETE /api/contents/:id - Delete content
router.delete('/:id', contentController.deleteContent);

module.exports = router;