const ContentPlanning = require('../models/ai_content.model');
const langGraphService = require('../services/ai.service');
const advancedOutlineService = require('../services/advanced_outline.service');
const imageService = require('../services/image.service');
class AiContentController {
    // Tạo project mới
    async createProject(req, res) {
        try {
            const {
                brand_name,
                main_keyword,
                lsi_keywords,
                secondary_keywords,
                output_language
            } = req.body;

            // Validation
            if (!brand_name || !main_keyword) {
                return res.status(400).json({
                    success: false,
                    message: 'brandName và mainKeyword là bắt buộc'
                });
            }

            const project = await ContentPlanning.create({
                brand_name,
                main_keyword,
                lsi_keywords,
                secondary_keywords,
                output_language: output_language || 'Vietnamese'
            });

            res.status(201).json({
                success: true,
                message: 'Tạo project thành công',
                data: project
            });

        } catch (error) {
            console.error('Lỗi khi tạo project:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    async runContentPlanningWorkflow(req, res) {
        const projectId = req.params.id;

        try {
            const project = await ContentPlanning.findByPk(projectId);

            if (!project) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy project'
                });
            }

            await project.update({
                status_writing: 'processing'
            });

            console.log(`\n🚀 [Project ${project.id}] Starting Content Planning Workflow...`);

            // Step 1: Phân tích Search Intent
            console.log('📍 Step 1/4: Analyzing Search Intent...');
            const searchIntent = await langGraphService.analyzeSearchIntentAgent(
                project.main_keyword,
                project.lsi_keywords,
                project.output_language
            );

            await project.update({
                search_intent: searchIntent,
                status_writing: 'search_intent_completed'
            });

            let titleAndMeta;
            try {
                titleAndMeta = await langGraphService.generateTitleAndDescriptionAgent(
                    project.main_keyword,
                    project.lsi_keywords,
                    searchIntent,
                    project.output_language
                );
            } catch (error) {
                console.log('⚠️  Using previous title');
            }

            // Step 2: Phân tích Competitors
            console.log('📍 Step 2/4: Analyzing Top 10 Competitors...');
            const competitorAnalysis = await langGraphService.analyzeCompetitorsAgent(
                project.main_keyword,
                project.lsi_keywords,
                project.output_language,
                searchIntent
            );

            await project.update({
                competitor_analysis: competitorAnalysis,
                status_writing: 'competitor_analysis_completed'
            });

            // Step 3: Basic Outline
            console.log('📍 Step 3/4: Creating Basic Outline...');
            const basicOutline = await langGraphService.createOutlineAgent(
                searchIntent,
                competitorAnalysis,
                project.output_language
            );

            // Step 4: Generate Advanced Outline
            console.log('📍 Step 4/4: Generating Advanced Outline...');
            const advancedOutline = await advancedOutlineService.generateAdvancedOutline({
                brand_name: project.brand_name,
                main_keyword: project.main_keyword,
                lsi_keywords: project.lsi_keywords,
                output_language: project.output_language,
                muc_dich_tim_kiem: project.muc_dich_tim_kiem,
                current_outline: basicOutline,
                search_intent: searchIntent,
                competitor_analysis: competitorAnalysis,
                needsResearch: true // Enable Perplexity research
            });

            // Validate outline quality
            const validation = advancedOutlineService.validateOutline(advancedOutline);
            console.log(`📊 Outline Quality Score: ${(validation.score * 100).toFixed(1)}%`);

            // Lưu kết quả
            await project.update({
                title_content: titleAndMeta.title,
                meta_description: titleAndMeta.meta_description,
                outline_result: advancedOutline,
                status_writing: 'outline_completed'
            });

            console.log(`✅ [Project ${project.id}] Workflow Completed Successfully!\n`);

            res.json({
                success: true,
                message: 'Content planning workflow hoàn thành',
                data: {
                    projectId: project.id,
                    title: titleAndMeta.title,
                    metaDescription: titleAndMeta.meta_description,
                    searchIntent,
                    competitorAnalysis,
                    outline: advancedOutline,
                    quality: {
                        score: validation.score,
                        isValid: validation.isValid,
                        structure: validation.details,
                        recommendations: validation.recommendations
                    },
                    status: project.status_writing
                }
            });

        } catch (error) {
            console.error(`❌ [Project ${projectId}] Workflow Error:`, error);

            if (projectId) {
                await ContentPlanning.update({
                    status_writing: 'failed'
                }, {
                    where: {
                        id: projectId
                    }
                });
            }

            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // Generate Full Content
    async generateFullContent(req, res) {
        const projectId = req.params.id;

        try {
            const project = await ContentPlanning.findByPk(projectId);

            if (!project) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy project'
                });
            }

            if (!project.outline_result) {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng chạy workflow tạo outline trước'
                });
            }

            await project.update({
                status_writing: 'generating_content'
            });

            console.log(`📄 [Project ${project.id}] Generating full content...`);
            let optimizedOutline = project.outline_result;

            if (!optimizedOutline) {
                optimizedOutline = await langGraphService.optimizeOutlineAgent(
                    project.outline_result, {
                        brand_name: project.brand_name,
                        main_keyword: project.main_keyword,
                        lsi_keywords: project.lsi_keywords,
                        output_language: project.output_language,
                        muc_dich_tim_kiem: project.muc_dich_tim_kiem,
                        search_intent: project.search_intent
                    }
                );
            }

            // Generate content
            const contentWithPlaceholders = await langGraphService.generateFullContentAgent({
                outline_result: optimizedOutline,
                brand_name: project.brand_name,
                main_keyword: project.main_keyword,
                lsi_keywords: project.lsi_keywords,
                output_language: project.output_language,
                muc_dich_tim_kiem: project.muc_dich_tim_kiem,
                search_intent: project.search_intent
            });

            const finalContent = await imageService.replaceImagePlaceholders(contentWithPlaceholders);

            await project.update({
                outline_result: optimizedOutline,
                content: finalContent,
                status_writing: 'content_generated'
            });

            res.json({
                success: true,
                message: 'Tạo nội dung thành công',
                data: {
                    projectId: project.id,
                    title: project.title_content,
                    metaDescription: project.meta_description,
                    optimizedOutline: optimizedOutline,
                    content: finalContent,
                    status: project.status_writing
                }
            });

        } catch (error) {
            console.error(`❌ Error generating content:`, error);

            if (projectId) {
                await ContentPlanning.update({
                    status_writing: 'failed'
                }, {
                    where: {
                        id: projectId
                    }
                });
            }

            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // Lấy thông tin project
    async getProject(req, res) {
        try {
            const project = await ContentPlanning.findByPk(req.params.id);

            if (!project) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy project'
                });
            }

            res.json({
                success: true,
                data: project
            });

        } catch (error) {
            console.error('Lỗi khi lấy project:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // List projects
    async listProjects(req, res) {
        try {
            const {
                status,
                page = 1,
                limit = 20
            } = req.query;

            const where = {};
            if (status) {
                where.status = status;
            }

            const offset = (page - 1) * limit;

            const {
                count,
                rows
            } = await ContentPlanning.findAndCountAll({
                where,
                limit: parseInt(limit),
                offset: parseInt(offset),
                order: [
                    ['createdAt', 'DESC']
                ]
            });

            res.json({
                success: true,
                data: {
                    total: count,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(count / limit),
                    projects: rows
                }
            });

        } catch (error) {
            console.error('Lỗi khi list projects:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // Xóa project
    async deleteProject(req, res) {
        try {
            const project = await ContentPlanning.findByPk(req.params.id);

            if (!project) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy project'
                });
            }

            await project.destroy();

            res.json({
                success: true,
                message: 'Xóa project thành công'
            });

        } catch (error) {
            console.error('Lỗi khi xóa project:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
}

module.exports = new AiContentController();