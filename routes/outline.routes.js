const express = require('express');
const router = express.Router();
const outlineController = require('../controllers/outline.controller');

// POST /api/outlines - Create + Generate outline
router.post('/', outlineController.createOutline);

// GET /api/outlines/:id - Get outline
router.get('/:id', outlineController.getOutline);

// GET /api/outlines - List outlines
router.get('/', outlineController.listOutlines);

// DELETE /api/outlines/:id - Delete outline
router.delete('/:id', outlineController.deleteOutline);

module.exports = router;