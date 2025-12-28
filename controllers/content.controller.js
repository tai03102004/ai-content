const ContentModel = require('../models/content.model');
const OutlineModel = require('../models/outline.model');
const aiService = require('../services/ai.service');
const imageService = require('../services/image.service');

class ContentController {
    // Generate content from existing outline
    async generateFromOutline(req, res) {
        try {
            const { outline_id } = req.params;

            const outline = await OutlineModel.findByPk(outline_id);
            if (!outline) {
                return res.status(404).json({
                    success: false,
                    message: 'Outline not found'
                });
            }

            if (!outline.outline_result) {
                return res.status(400).json({
                    success: false,
                    message: 'Outline not completed yet'
                });
            }

            // Create content record
            const content = await ContentModel.create({
                outline_id: outline.id,
                brand_name: outline.brand_name,
                primary_keyword: outline.primary_keyword,
                secondary_keywords: outline.secondary_keywords,
                semantic_keywords: outline.semantic_keywords,
                article_type: outline.article_type,
                framework_id: outline.framework_id,
                point_of_view_id: outline.point_of_view_id,
                tone_of_voice_id: outline.tone_of_voice_id,
                intro_length: outline.intro_length,
                paragraph_length: outline.paragraph_length,
                target_word_count: req.body.target_word_count || 2000,
                output_language: outline.output_language,
                title_content: outline.title_content,
                meta_description: outline.meta_description,
                outline_used: outline.outline_result,
                status: 'generating'
            });

            console.log(`\n${'='.repeat(70)}`);
            console.log(`📄 CONTENT GENERATION - ID #${content.id}`);
            console.log(`   From Outline: #${outline.id}`);
            console.log(`${'='.repeat(70)}\n`);

            // Generate HTML content
            const htmlContent = await aiService.generateContent({
                primary_keyword: content.primary_keyword,
                semantic_keywords: content.semantic_keywords,
                outline_used: content.outline_used,
                title_content: content.title_content,
                meta_description: content.meta_description,
                article_type: content.article_type,
                tone_of_voice_id: content.tone_of_voice_id,
                intro_length: content.intro_length,
                paragraph_length: content.paragraph_length,
                target_word_count: content.target_word_count,
                output_language: content.output_language
            });

            // Replace image placeholders
            const finalContent = await imageService.replaceImagePlaceholders(htmlContent);

            // Calculate metrics
            const wordCount = finalContent.split(/\s+/).length;
            const imageCount = (finalContent.match(/<img/g) || []).length;

            await content.update({
                content_html: finalContent,
                word_count: wordCount,
                image_count: imageCount,
                status: 'completed'
            });

            console.log(`\n${'='.repeat(70)}`);
            console.log('✅ CONTENT GENERATION COMPLETED');
            console.log(`   Words: ${wordCount}`);
            console.log(`   Images: ${imageCount}`);
            console.log(`${'='.repeat(70)}\n`);

            res.json({
                success: true,
                message: 'Content generated successfully',
                data: {
                    id: content.id,
                    title: content.title_content,
                    meta_description: content.meta_description,
                    content_html: finalContent,
                    stats: {
                        word_count: wordCount,
                        image_count: imageCount
                    },
                    status: 'completed'
                }
            });

        } catch (error) {
            console.error('❌ Content Generation Error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    // Create standalone content (without outline)
    async createStandaloneContent(req, res) {
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
                target_word_count,
                output_language
            } = req.body;

            if (!brand_name || !primary_keyword) {
                return res.status(400).json({
                    success: false,
                    message: 'brand_name and primary_keyword required'
                });
            }

            // Step 1: Quick outline generation
            const searchIntent = await aiService.analyzeSearchIntent({
                primary_keyword,
                semantic_keywords,
                output_language: output_language || 'Vietnamese'
            });

            const competitorAnalysis = await aiService.analyzeCompetitors({
                primary_keyword,
                semantic_keywords,
                search_intent: searchIntent,
                output_language: output_language || 'Vietnamese'
            });

            const titleMeta = await aiService.generateTitleMeta({
                primary_keyword,
                semantic_keywords,
                search_intent: searchIntent,
                output_language: output_language || 'Vietnamese'
            });

            const quickOutline = await aiService.createDetailedOutline({
                primary_keyword,
                semantic_keywords,
                search_intent: searchIntent,
                competitor_analysis: competitorAnalysis,
                article_type,
                framework_id,
                tone_of_voice_id,
                output_language: output_language || 'Vietnamese'
            });

            // Step 2: Create content
            const content = await ContentModel.create({
                brand_name,
                primary_keyword,
                secondary_keywords,
                semantic_keywords,
                article_type,
                framework_id,
                point_of_view_id,
                tone_of_voice_id,
                target_word_count: target_word_count || 2000,
                output_language: output_language || 'Vietnamese',
                title_content: titleMeta.title,
                meta_description: titleMeta.meta_description,
                outline_used: quickOutline,
                status: 'generating'
            });

            // Step 3: Generate HTML
            const htmlContent = await aiService.generateContent({
                primary_keyword: content.primary_keyword,
                semantic_keywords: content.semantic_keywords,
                outline_used: content.outline_used,
                title_content: content.title_content,
                meta_description: content.meta_description,
                article_type: content.article_type,
                tone_of_voice_id: content.tone_of_voice_id,
                target_word_count: content.target_word_count,
                output_language: content.output_language
            });

            const finalContent = await imageService.replaceImagePlaceholders(htmlContent);
            const wordCount = finalContent.split(/\s+/).length;
            const imageCount = (finalContent.match(/<img/g) || []).length;

            await content.update({
                content_html: finalContent,
                word_count: wordCount,
                image_count: imageCount,
                status: 'completed'
            });

            res.json({
                success: true,
                message: 'Standalone content generated',
                data: {
                    id: content.id,
                    title: content.title_content,
                    meta_description: content.meta_description,
                    content_html: finalContent,
                    stats: {
                        word_count: wordCount,
                        image_count: imageCount
                    }
                }
            });

        } catch (error) {
            console.error('❌ Standalone Content Error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    // Get content by ID
    async getContent(req, res) {
        try {
            const content = await ContentModel.findByPk(req.params.id, {
                include: [{
                    model: OutlineModel,
                    as: 'outline'
                }]
            });

            if (!content) {
                return res.status(404).json({
                    success: false,
                    message: 'Content not found'
                });
            }

            res.json({ success: true, data: content });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    // List contents
    async listContents(req, res) {
        try {
            const { page = 1, limit = 20, status } = req.query;
            const where = status ? { status } : {};

            const { count, rows } = await ContentModel.findAndCountAll({
                where,
                limit: parseInt(limit),
                offset: (page - 1) * limit,
                order: [['created_at', 'DESC']],
                include: [{
                    model: OutlineModel,
                    as: 'outline',
                    attributes: ['id', 'primary_keyword', 'title_content']
                }]
            });

            res.json({
                success: true,
                data: {
                    total: count,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(count / limit),
                    contents: rows
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    // Delete content
    async deleteContent(req, res) {
        try {
            const content = await ContentModel.findByPk(req.params.id);
            
            if (!content) {
                return res.status(404).json({
                    success: false,
                    message: 'Content not found'
                });
            }

            await content.destroy();
            res.json({ success: true, message: 'Content deleted' });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
}

module.exports = new ContentController();