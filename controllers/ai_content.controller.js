const ContentPlanning = require('../models/ai_content.model');
const openaiService = require('../services/ai.service');

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

    // Phân tích Search Intent
    async analyzeSearchIntent(req, res) {
        const projectId = req.params.id;

        try {
            const project = await ContentPlanning.findByPk(projectId);

            if (!project) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy project'
                });
            }

            // Update status
            await project.update({
                processingStartedAt: new Date(),
                status: 'search_intent_analyzed'
            });

            console.log(`🔍 [Project ${project.id}] Đang phân tích Search Intent...`);

            // Gọi OpenAI để phân tích
            const searchIntentAnalysis = await openaiService.analyzeSearchIntent(
                project.main_keyword,
                project.lsi_keywords,
                project.secondary_keywords,
                project.output_language
            );

            // Lưu kết quả
            await project.update({
                search_intent: searchIntentAnalysis,
                status: 'search_intent_analyzed',
                processingCompletedAt: new Date()
            });

            console.log(`✅ [Project ${project.id}] Hoàn thành phân tích Search Intent`);

            res.json({
                success: true,
                message: 'Phân tích Search Intent thành công',
                data: {
                    projectId: project.id,
                    mainKeyword: project.main_keyword,
                    search_intent: searchIntentAnalysis,
                    status: project.status
                }
            });

        } catch (error) {
            console.error(`❌ Lỗi phân tích Search Intent:`, error);

            // Update status thành failed
            if (projectId) {
                await ContentPlanning.update({
                    status: 'failed',
                    errorMessage: error.message,
                    processingCompletedAt: new Date()
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