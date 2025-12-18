const {
    ChatOpenAI
} = require('@langchain/openai');
const {
    HumanMessage,
    SystemMessage
} = require('@langchain/core/messages');

class LangGraphAgentService {
    constructor() {
        this.contentModel = new ChatOpenAI({
            modelName: 'gpt-5',
            temperature: 1,
            maxTokens: 15000,
            timeout: 120000,
            openAIApiKey: process.env.OPENAI_API_KEY_content,
            configuration: {
                baseURL: 'https://api.yescale.io/v1',
            }
        });

        this.model = new ChatOpenAI({
            modelName: 'gpt-4.1-mini-2025-04-14',
            temperature: 1,
            maxTokens: 10000,
            timeout: 120000,
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
            console.log('🤖 Agent 5: Generating SEO-optimized HTML Content...');

            const messages = [
                new SystemMessage(
                    `[Role]: Expert SEO Content Writer specialized in creating engaging, conversion-focused HTML articles.\n\n` +
                    `[Guidelines]: Follow Google E-E-A-T, semantic SEO, Web Vitals best practices.\n\n` +
                    `[Outline]: ${projectData.outline_result}\n\n` +
                    `[Brand]: ${projectData.brand_name}\n` +
                    `[Main Keyword]: ${projectData.main_keyword}\n` +
                    `[LSI Keywords]: ${projectData.lsi_keywords}\n` +
                    `[Language]: ${projectData.output_language}\n\n` +
                    `[HTML Structure Requirements]:\n` +
                    `1. Use semantic HTML5 tags: <article>, <section>, <header>, <aside>, <figure>\n` +
                    `2. Proper heading hierarchy: <h1> → <h2> → <h3>\n` +
                    `3. Paragraphs: <p> tags with proper spacing\n` +
                    `4. Lists: <ul>/<ol> with <li> items\n` +
                    `5. Important text: <strong> for keywords, <em> for emphasis\n` +
                    `6. Links: <a href="#internal"> for internal links\n` +
                    `7. Blockquotes: <blockquote> for expert quotes\n` +
                    `8. Tables: <table> with proper <thead>, <tbody>\n\n` +
                    `[SEO & Readability Rules]:\n` +
                    `1. First paragraph (hook): 100-150 words, include main keyword\n` +
                    `2. Paragraphs: 2-4 sentences max (50-80 words)\n` +
                    `3. Subheadings every 250-300 words\n` +
                    `4. Bullet points for scannability\n` +
                    `5. Bold main keyword 2-3 times naturally\n` +
                    `6. Add "Key Takeaways" box at start\n` +
                    `7. Add FAQ section at end (if applicable)\n` +
                    `8. Include CTA (Call-to-Action) buttons\n\n` +
                    `[Image Placeholders]:\n` +
                    `Insert 5-8 placeholders: <!-- IMAGE_PLACEHOLDER: "keyword" -->\n` +
                    `Place after intro, before H2 sections, after complex explanations.\n\n` +
                    `[Engagement Elements]:\n` +
                    `- Use "you/your" to speak directly to reader\n` +
                    `- Include actionable tips in numbered lists\n` +
                    `- Add "Pro Tip" boxes\n` +
                    `- Use transition words (However, Moreover, Therefore)\n` +
                    `- Include real examples and case studies\n\n` +
                    `[Output Format]:\n` +
                    `Full HTML article ready to paste into WordPress/CMS.\n` +
                    `No <!DOCTYPE>, <html>, <head>, <body> tags - just article content.\n` +
                    `Use inline CSS for styling (portable across platforms).`
                ),
                new HumanMessage(
                    `Write a complete, SEO-optimized HTML article for: "${projectData.main_keyword}"\n\n` +
                    `Structure:\n` +
                    `1. <article> wrapper with proper schema.org markup\n` +
                    `2. <header> with H1 title + meta info (read time, author, date)\n` +
                    `3. Key Takeaways box (highlighted)\n` +
                    `4. Table of Contents (jump links)\n` +
                    `5. Main content sections with H2/H3\n` +
                    `6. FAQ section (if applicable)\n` +
                    `7. Conclusion with CTA\n\n` +
                    `Requirements:\n` +
                    `✓ Expand ALL sections from outline\n` +
                    `✓ Conversational, engaging tone\n` +
                    `✓ Real examples, 2025 data, case studies\n` +
                    `✓ 5-8 image placeholders\n` +
                    `✓ Internal linking opportunities (use # placeholders)\n` +
                    `✓ Output in ${projectData.output_language}\n` +
                    `✓ Ready for WordPress/CMS paste\n\n` +
                    `Remember: Write for humans first, search engines second!`
                )
            ];

            const response = await this.contentModel.invoke(messages);

            console.log('✅ Agent 5: HTML content generated');
            return response.content;

        } catch (error) {
            console.error('❌ Agent 5 Error:', error);
            throw error;
        }
    }
}

module.exports = new LangGraphAgentService();