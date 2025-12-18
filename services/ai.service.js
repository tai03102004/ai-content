const {
    ChatOpenAI
} = require('@langchain/openai');
const {
    HumanMessage,
    SystemMessage
} = require('@langchain/core/messages');

class LangGraphAgentService {
    constructor() {
        // Sử dụng YeScale API endpoint
        this.model = new ChatOpenAI({
            modelName: 'gpt-4.1-mini-2025-04-14',
            temperature: 1,
            maxTokens: 10000,
            openAIApiKey: process.env.OPENAI_API_KEY,
            configuration: {
                baseURL: 'https://api.yescale.io/v1'
            }
        });

        this.lightModel = new ChatOpenAI({
            modelName: 'gpt-4.1-mini-2025-04-14',
            temperature: 0.8,
            maxTokens: 500,
            openAIApiKey: process.env.OPENAI_API_KEY,
            configuration: {
                baseURL: 'https://api.yescale.io/v1'
            }
        });
    }

    // Agent 0 - Generate Title & Meta Description
    async generateTitleAndDescriptionAgent(mainKeyword, lsiKeywords, searchIntent, outputLanguage) {
        try {
            console.log('🤖 Agent 0: Generating Title & Meta Description...');

            const messages = [
                new SystemMessage(
                    `You are an SEO Expert specializing in crafting high-CTR titles and meta descriptions.`
                ),
                new HumanMessage(
                    `Create an SEO-optimized Title and Meta Description for:
                        - Main Keyword: "${mainKeyword}"
                        - LSI Keywords: "${lsiKeywords}"
                        - Search Intent: ${searchIntent.substring(0, 300)}

                        Requirements:
                        ✓ Title: 50-60 characters, include main keyword, add power words (2025, Complete, Ultimate, Guide)
                        ✓ Meta Description: 150-160 characters, include main keyword + 1 LSI keyword, clear CTA
                        ✓ Output language: ${outputLanguage}
                        ✓ Format: JSON only

                        Output format:
                        {
                        "title": "...",
                        "meta_description": "..."
                        }`
                )
            ];

            const response = await this.lightModel.invoke(messages);

            // Parse JSON từ response
            const jsonMatch = response.content.match(/\{[\s\S]*\}/);
            const result = jsonMatch ? JSON.parse(jsonMatch[0]) : {
                title: mainKeyword,
                meta_description: `Tìm hiểu về ${mainKeyword}`
            };

            console.log(`✅ Title: ${result.title}`);
            console.log(`✅ Meta: ${result.meta_description}`);

            return result;

        } catch (error) {
            console.error('❌ Agent 0 Error:', error);
            return {
                title: mainKeyword,
                meta_description: `Hướng dẫn chi tiết về ${mainKeyword}`
            };
        }
    }

    // Agent 1: Phân tích Search Intent
    async analyzeSearchIntentAgent(mainKeyword, lsiKeywords, outputLanguage) {
        try {
            console.log('🤖 Agent 1: Analyzing Search Intent...');

            const messages = [
                new SystemMessage(
                    '[Instruction]: Answer in Markdown format with clear structure, bullet points, and short paragraphs.\n\n' +
                    '[Role]: You are a Researcher & Semantic SEO Expert who is a master of the Topical Authority Concept from Koray. Your task is to analyse the Search Intent behind the query.'
                ),
                new HumanMessage(
                    `Analyse the query: [${mainKeyword} including related terms ${lsiKeywords}]; what would users be looking for if they searched it? Determine the search intent on Google and explain how to fully satisfy it. Prioritise content in *${outputLanguage}* but also provide English examples if relevant.\n\n### Output Language:\n*${outputLanguage}*`
                )
            ];

            const response = await this.model.invoke(messages);

            console.log('✅ Agent 1: Search Intent Analysis completed');
            return response.content;

        } catch (error) {
            console.error('❌ Agent 1 Error:', error);
            throw new Error(`Search Intent Agent Error: ${error.message}`);
        }
    }

    // Agent 2: Phân tích Top 10 Competitors
    async analyzeCompetitorsAgent(mainKeyword, lsiKeywords, outputLanguage, searchIntent) {
        try {
            console.log('🤖 Agent 2: Analyzing Top 10 Competitors...');

            const messages = [
                new SystemMessage(
                    `[Knowledge about User's Search Intent]: ${searchIntent}\n\n` +
                    `[Instruction]: Answer in Markdown format with clear structure, bullet points, and short paragraphs.\n\n` +
                    `[Role]: You are a Semantic SEO Expert who is a master of the Topical Authority Concept from Koray. Your task is to analyze the competitor's content outline with the provided 'User's Search Intent' in mind.`
                ),
                new HumanMessage(
                    `## Task:\nIdentify the 10 best online articles that answer the query: *${mainKeyword}* including related terms ${lsiKeywords}, and satisfy the search intent that you have been provided\n\n` +
                    `### Requirements:\n` +
                    `- Explain WHY these articles are the best.\n` +
                    `- EXCLUDE any video content.\n` +
                    `- Search and compare both *${outputLanguage}* & English articles, but prioritize *${outputLanguage}*.\n\n` +
                    `### Output Language:\n*${outputLanguage}*`
                )
            ];

            const response = await this.model.invoke(messages);

            console.log('✅ Agent 2: Competitor Analysis completed');
            return response.content;

        } catch (error) {
            console.error('❌ Agent 2 Error:', error);
            throw new Error(`Competitor Analysis Agent Error: ${error.message}`);
        }
    }

    // Agent 3: Tạo Outline
    async createOutlineAgent(searchIntent, competitorAnalysis, outputLanguage) {
        try {
            console.log('🤖 Agent 3: Creating Outline...');

            const messages = [
                new SystemMessage(
                    `[Knowledge about User's Search Intent]: ${searchIntent}\n\n` +
                    `[competitor's outline information]: ${competitorAnalysis}\n\n` +
                    `[Instruction]: Answer in Markdown format with clear structure, bullet points, and short paragraphs.\n\n` +
                    `[Role]: You are a Semantic SEO Expert knowledgeable about topical authority, semantic content, and creating great SEO-friendly content that meets the "Search Quality Evaluator Guideline", "Google helpful content" & "Google product review guideline".`
                ),
                new HumanMessage(
                    `Start by reading these documents:\n` +
                    `- http://static.googleusercontent.com/media/guidelines.raterhub.com/en//searchqualityevaluatorguidelines.pdf\n` +
                    `- https://developers.google.com/search/docs/fundamentals/creating-helpful-content?hl=en\n\n` +
                    `Then, based strictly on the guidelines or principles outlined in the documents and the "Search Quality Evaluator Guideline" PDF from Google, analyse **the top 10 competitor articles**. Compare them in terms of depth and details of content, demonstration of expertise and credibility, and how well they fulfil the user's intent.\n\n` +
                    `I want you to create the outline for the content of the keywords I've provided. The outline must be better than the competitors' or at least as good as theirs.\n\n` +
                    `### Output Language:\n*${outputLanguage}* (only provide the final outline in this language)`
                )
            ];

            const response = await this.model.invoke(messages);

            console.log('✅ Agent 3: Outline created');
            return response.content;

        } catch (error) {
            console.error('❌ Agent 3 Error:', error);
            throw new Error(`Outline Creation Agent Error: ${error.message}`);
        }
    }

    // Optimize Outline Agent (optional enhancement)
    async optimizeOutlineAgent(outline, projectData) {
        try {
            console.log('🤖 Agent 4: Optimizing Outline...');

            const messages = [
                new SystemMessage(
                    `[role]: You are a Semantic SEO Expert knowledgeable about topical authority, semantic content, and Creating great Semantic SEO-friendly Content.\n\n` +
                    `[Information about the current outline content]: ${outline}\n\n` +
                    `[Search Intent of the Keywords]:\n` +
                    `1. The Search Intent of the keyword is: ${projectData.muc_dich_tim_kiem || 'Informational'}\n` +
                    `2. Also this is the detailed search intent: ${projectData.search_intent}\n\n` +
                    `[Source context of the brand]:\n` +
                    `1. Brand name: "${projectData.brand_name}".\n` +
                    `2. Main Keyword: "${projectData.main_keyword}".\n` +
                    `3. LSI Keywords: "${projectData.lsi_keywords}".\n\n` +
                    `[Task/Instruction]: Your task is to Re-optimize, adjust or developed a detailed outline that based on the current outline and ensure the guidelines below.`
                ),
                new HumanMessage(
                    `Based on the Google Helpful Content & the Checklist Outline & Article Methodology, create a complete outline for a blog post.\n\n` +
                    `[final reminder]:\n` +
                    `1. Output should be in ${projectData.output_language}\n` +
                    `2. The output should be in Markdown format\n` +
                    `3. If the outline has a list, include the full list\n` +
                    `4. This is the year 2025\n` +
                    `5. The output should only contain the outline & article methodology`
                )
            ];

            const response = await this.model.invoke(messages);

            console.log('✅ Agent 4: Outline optimized');
            return response.content;

        } catch (error) {
            console.error('❌ Agent 4 Error:', error);
            throw error;
        }
    }

    // Agent 5 - Generate Full Content (TỐI ƯU)
    async generateFullContentAgent(projectData) {
        try {
            console.log('🤖 Agent 5: Generating Full Content with Image Placeholders...');

            const messages = [
                new SystemMessage(
                    `[Role]: Expert content writer specialized in SEO-optimized, engaging articles.\n\n` +
                    `[Guidelines]: Follow Google E-E-A-T, semantic SEO, 2025 standards.\n\n` +
                    `[Outline]: ${projectData.outline_result}\n\n` +
                    `[Brand]: ${projectData.brand_name}\n` +
                    `[Main Keyword]: ${projectData.main_keyword}\n` +
                    `[LSI Keywords]: ${projectData.lsi_keywords}\n` +
                    `[Language]: ${projectData.output_language}\n\n` +
                    `[CRITICAL - Image Placeholder Rules]:\n` +
                    `1. Insert 5-8 image placeholders using EXACT format:\n` +
                    `   <!-- IMAGE_PLACEHOLDER: "descriptive keyword for image search" -->\n\n` +
                    `2. Place images strategically:\n` +
                    `   - After introduction (within first 200 words)\n` +
                    `   - Before major H2 sections\n` +
                    `   - After complex explanations\n` +
                    `   - Before case studies or examples\n` +
                    `   - At natural break points\n\n` +
                    `3. Image keywords should be:\n` +
                    `   - Descriptive and specific (not generic)\n` +
                    `   - Related to section content\n` +
                    `   - 2-5 words long\n` +
                    `   - In English (for better image search results)\n\n` +
                    `Examples of GOOD placeholders:\n` +
                    `   <!-- IMAGE_PLACEHOLDER: "artificial intelligence robot technology" -->\n` +
                    `   <!-- IMAGE_PLACEHOLDER: "digital marketing analytics dashboard" -->\n` +
                    `   <!-- IMAGE_PLACEHOLDER: "team collaboration office meeting" -->\n\n` +
                    `Examples of BAD placeholders:\n` +
                    `   <!-- IMAGE_PLACEHOLDER: "image" --> (too generic)\n` +
                    `   <!-- IMAGE_PLACEHOLDER: "trí tuệ nhân tạo" --> (not in English)\n\n` +
                    `[Task]: Write a complete, full-length article following the outline. Include compelling examples, data, and strategic image placeholders.`
                ),
                new HumanMessage(
                    `Write the complete article for: "${projectData.main_keyword}"\n\n` +
                    `Requirements:\n` +
                    `✓ Expand ALL sections from outline\n` +
                    `✓ Natural, engaging writing style\n` +
                    `✓ Real examples, case studies, 2025 data\n` +
                    `✓ 5-8 strategic image placeholders\n` +
                    `✓ Smooth transitions between sections\n` +
                    `✓ Output in ${projectData.output_language}\n` +
                    `✓ Markdown format\n\n` +
                    `DO NOT explain the placeholders, just include them in the content naturally.`
                )
            ];

            const response = await this.model.invoke(messages);

            console.log('✅ Agent 5: Content with placeholders generated');
            return response.content;

        } catch (error) {
            console.error('❌ Agent 5 Error:', error);
            throw error;
        }
    }
}

module.exports = new LangGraphAgentService();