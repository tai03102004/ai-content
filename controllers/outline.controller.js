const OutlineModel = require('../models/outline.model');
const aiService = require('../services/ai.service');

class OutlineController {
    // Create + Generate Outline (Single API call)
    async createOutline(req, res) {
        try {
            const {
                brand_name,
                primary_keyword,
                secondary_keywords,
                semantic_keywords,
                article_type,
                framework_id,
                point_of_view_id,
                tone_of_voice_id,
                outline_length,
                intro_length,
                paragraph_length,
                output_language
            } = req.body;

            // Validate
            if (!brand_name || !primary_keyword) {
                return res.status(400).json({
                    success: false,
                    message: 'brand_name and primary_keyword are required'
                });
            }

            // Create outline record
            const outline = await OutlineModel.create({
                brand_name,
                primary_keyword,
                secondary_keywords,
                semantic_keywords,
                article_type,
                framework_id,
                point_of_view_id,
                tone_of_voice_id,
                outline_length,
                intro_length,
                paragraph_length,
                output_language: output_language || 'Vietnamese',
                status: 'processing'
            });

            console.log(`\n${'='.repeat(70)}`);
            console.log(`📝 OUTLINE GENERATION - ID #${outline.id}`);
            console.log(`   Keyword: ${primary_keyword}`);
            console.log(`${'='.repeat(70)}\n`);

            // Step 1: Search Intent + Research
            const searchIntent = await aiService.analyzeSearchIntent({
                primary_keyword,
                semantic_keywords,
                output_language: outline.output_language
            });

            await outline.update({ search_intent_analysis: searchIntent });

            // Step 2: Competitor Analysis
            const competitorAnalysis = await aiService.analyzeCompetitors({
                primary_keyword,
                semantic_keywords,
                search_intent: searchIntent,
                output_language: outline.output_language
            });

            await outline.update({ competitor_analysis: competitorAnalysis });

            // Step 3: Generate Title + Meta
            const titleMeta = await aiService.generateTitleMeta({
                primary_keyword,
                semantic_keywords,
                search_intent: searchIntent,
                output_language: outline.output_language
            });

            // Step 4: Create Detailed Outline
            const detailedOutline = await aiService.createDetailedOutline({
                primary_keyword,
                semantic_keywords,
                search_intent: searchIntent,
                competitor_analysis: competitorAnalysis,
                article_type: outline.article_type,
                framework_id: outline.framework_id,
                tone_of_voice_id: outline.tone_of_voice_id,
                outline_length: outline.outline_length,
                intro_length: outline.intro_length,
                paragraph_length: outline.paragraph_length,
                output_language: outline.output_language
            });

            // Save final result
            await outline.update({
                title_content: titleMeta.title,
                meta_description: titleMeta.meta_description,
                outline_result: detailedOutline,
                status: 'completed'
            });

            console.log(`\n${'='.repeat(70)}`);
            console.log('✅ OUTLINE GENERATION COMPLETED');
            console.log(`${'='.repeat(70)}\n`);

            res.json({
                success: true,
                message: 'Outline generated successfully',
                data: {
                    id: outline.id,
                    title: titleMeta.title,
                    meta_description: titleMeta.meta_description,
                    outline: detailedOutline,
                    search_intent: searchIntent,
                    competitor_analysis: competitorAnalysis,
                    status: 'completed'
                }
            });

        } catch (error) {
            console.error('❌ Outline Generation Error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // Get outline by ID
    async getOutline(req, res) {
        try {
            const outline = await OutlineModel.findByPk(req.params.id);
            
            if (!outline) {
                return res.status(404).json({
                    success: false,
                    message: 'Outline not found'
                });
            }

            res.json({
                success: true,
                data: outline
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    // List outlines
    async listOutlines(req, res) {
        try {
            const { page = 1, limit = 20, status } = req.query;
            const where = status ? { status } : {};

            const { count, rows } = await OutlineModel.findAndCountAll({
                where,
                limit: parseInt(limit),
                offset: (page - 1) * limit,
                order: [['created_at', 'DESC']]
            });

            res.json({
                success: true,
                data: {
                    total: count,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(count / limit),
                    outlines: rows
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    // Delete outline
    async deleteOutline(req, res) {
        try {
            const outline = await OutlineModel.findByPk(req.params.id);
            
            if (!outline) {
                return res.status(404).json({
                    success: false,
                    message: 'Outline not found'
                });
            }

            await outline.destroy();
            res.json({ success: true, message: 'Outline deleted' });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
}

module.exports = new OutlineController();