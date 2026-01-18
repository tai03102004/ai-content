const { ChatOpenAI } = require('@langchain/openai');
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
const axios = require('axios');

class AIService {
    constructor() {

        this.ragServiceUrl = process.env.RAG_SERVICE_URL || 'http://localhost:5001';
        // Primary model
        this.model = new ChatOpenAI({
            modelName: 'gpt-4.1-mini-2025-04-14',
            temperature: 1,
            maxTokens: 15000,
            timeout: 180000,
            openAIApiKey: process.env.OPENAI_API_KEY,
            configuration: {
                baseURL: 'https://api.yescale.io/v1'
            }
        });

        // Light model for quick tasks
        this.lightModel = new ChatOpenAI({
            modelName: 'gpt-4.1-mini-2025-04-14',
            temperature: 0.8,
            maxTokens: 500,
            timeout: 60000,
            openAIApiKey: process.env.OPENAI_API_KEY,
            configuration: {
                baseURL: 'https://api.yescale.io/v1'
            }
        });
    }

    async getRagContext(query, queryType = 'general', numResults = 5) {
        try {
            console.log(`📚 Fetching RAG context for: "${query}"`);
            
            const response = await axios.post(`${this.ragServiceUrl}/retrieve`, {
                query,
                query_type: queryType,
                num_results: numResults,
                use_hyde: true  
            });

            if (response.data.success) {
                console.log(`✅ RAG retrieved ${response.data.num_docs} documents\n`);
                return response.data.raw_context;  
            } else {
                console.warn('⚠️  RAG retrieval failed, proceeding without context');
                return null;
            }
        } catch (error) {
            console.error(`❌ RAG Service error: ${error.message}`);
            return null;  
        }
    }

    // ✅ Agent 1: Search Intent + Research (Combined)
    async analyzeSearchIntent(params) {
        const { primary_keyword, semantic_keywords, output_language } = params;
        
        console.log('🤖 Agent 1: Analyzing Search Intent + Real-time Research...');

        const ragContext = await this.getRagContext(
            `Search intent analysis for: ${primary_keyword}`,
            'research',  // ← queryType: 'research' for statistics & insights
            5
        );

        const systemPrompt = ragContext 
            ? `[ROLE]: Senior Search Intent Analyst & SEO Researcher\n` +
              `[MISSION]: Conduct comprehensive search intent analysis using PROVIDED REAL DATA\n` +
              `[DATA]: Here's actual research data:\n\n${ragContext}\n\n` +
              `[INSTRUCTION]: Output structured Markdown, cite the provided data`
            : `[ROLE]: Senior Search Intent Analyst & SEO Researcher\n` +
              `[MISSION]: Conduct comprehensive search intent analysis\n` +
              `[INSTRUCTION]: Output structured Markdown`;


        const messages = [
            new SystemMessage(systemPrompt),
            new HumanMessage(
                `Analyze search intent for: **"${primary_keyword}"**\n` +
                `Related terms: ${semantic_keywords}\n\n` +
                `**ANALYSIS FRAMEWORK:**\n\n` +
                `### 1. Intent Classification\n` +
                `- Primary intent: [Informational/Commercial/Navigational/Transactional]\n` +
                `- Secondary intent (if any)\n` +
                `- Confidence level & reasoning\n\n` +
                `### 2. User Profile & Questions\n` +
                `- Target audience: [Beginner/Intermediate/Expert]\n` +
                `- User pain points (3-5 specific problems)\n` +
                `- Core questions users need answered (5-7 questions)\n\n` +
                `### 3. Content Expectations\n` +
                `- Expected format: [Guide/Tutorial/Comparison/Review/Listicle]\n` +
                `- Depth level: [Overview/Detailed/Comprehensive]\n` +
                `- Key sections users expect to see\n\n` +
                `### 4. Topical Authority Map\n` +
                `- Essential subtopics to cover (8-10 topics)\n` +
                `- Related entities/concepts\n` +
                `- Semantic keywords to integrate\n\n` +
                `### 5. Real Data Points & Trends\n` +
                `${ragContext ? `- Use the provided research data to support analysis\n` : ``}` +
                `- Latest industry trends relevant to "${primary_keyword}"\n` +
                `- Current statistics/data (use 2025 context)\n` +
                `- Emerging best practices\n\n` +
                `**Output language:** ${output_language}`
            )
        ];

        const response = await this.model.invoke(messages);
        console.log('✅ Search Intent Analysis completed\n');
        return response.content;
    }

    // ✅ Agent 2: Competitor Analysis (Streamlined)
    async analyzeCompetitors(params) {
        const { primary_keyword, semantic_keywords, search_intent, output_language } = params;
        
        console.log('🤖 Agent 2: Analyzing Top Competitors...');

        const ragContext = await this.getRagContext(
            `Competitor analysis for: ${primary_keyword}`,
            'content', 
            7
        );

        const systemPrompt = ragContext
            ? `[ROLE]: SEO Competitive Intelligence Analyst\n` +
              `[CONTEXT]: User search intent: ${search_intent.substring(0, 300)}\n` +
              `[COMPETITOR DATA]: ${ragContext}\n\n` +
              `[INSTRUCTION]: Use provided data to identify gaps and opportunities`
            : `[ROLE]: SEO Competitive Intelligence Analyst\n` +
              `[CONTEXT]: User search intent: ${search_intent.substring(0, 500)}\n` +
              `[INSTRUCTION]: Critical, strategic analysis in Markdown`;


        const messages = [
            new SystemMessage(systemPrompt),
            new HumanMessage(
                `Analyze top competitor content for: **"${primary_keyword}"**\n\n` +
                `**COMPETITIVE ANALYSIS FRAMEWORK:**\n\n` +
                `### A. Structure Analysis (Top 3-5 Articles)\n` +
                `- Common H2/H3 patterns\n` +
                `- Content organization (MECE compliance?)\n` +
                `- Average content depth (word count, section length)\n\n` +
                `### B. E-E-A-T Assessment\n` +
                `- **Expertise signals:** Data usage, case studies, technical depth\n` +
                `- **Authority signals:** Citations, expert quotes, credentials\n` +
                `- **Trust signals:** Transparency, balanced views, disclaimers\n\n` +
                `### C. Gap Analysis\n` +
                `- **Unanswered user questions:** What do they miss from the search intent?\n` +
                `- **Missing subtopics:** What related topics are ignored?\n` +
                `- **Weak execution:** Poor explanations, outdated info, lack of examples\n\n` +
                `### D. Victory Blueprint\n` +
                `Synthesize into actionable strategy:\n` +
                `- **Must-Have Sections:** 5-7 non-negotiable H2s\n` +
                `- **Differentiation Opportunities:** 3 ways to outperform\n` +
                `- **Unique Angle:** 1 fresh perspective competitors lack\n\n` +
                `**Output language:** ${output_language}`
            )
        ];

        const response = await this.model.invoke(messages);
        console.log('✅ Competitor Analysis completed\n');
        return response.content;
    }

    // ✅ Agent 3: Create Production-Ready Outline (All-in-One)
    async createDetailedOutline(params) {
        const {
            primary_keyword,
            semantic_keywords,
            search_intent,
            competitor_analysis,
            article_type,
            framework_id,
            tone_of_voice_id,
            outline_length,
            intro_length,
            paragraph_length,
            output_language
        } = params;
        
        console.log('🤖 Agent 3: Creating Production-Ready Outline...');

        const ragContext = await this.getRagContext(
            `Best structure and outline for: ${primary_keyword}`,
            'outline',  
            5
        );

        const systemPrompt = ragContext
            ? `[ROLE]: Senior SEO Content Architect\n` +
              `[MISSION]: Create battle-ready outline using PROVIDED REAL CONTENT DATA\n` +
              `[REFERENCE_DATA]:\n${ragContext}\n\n` +
              `[PRINCIPLES]: Google E-E-A-T, Helpful Content, Topical Authority\n` +
              `[INSTRUCTION]: Use provided data as reference for section structure\n\n`
            : `[ROLE]: Senior SEO Content Architect\n` +
              `[MISSION]: Create a battle-ready outline that guarantees search dominance\n` +
              `[PRINCIPLES]: Google E-E-A-T, Helpful Content, Topical Authority\n`;

        const messages = [
            new SystemMessage(
                systemPrompt +
                `[INPUTS]:\n` +
                `- Target Keyword: "${primary_keyword}"\n` +
                `- Article Type: ${article_type || 'Guide'}\n` +
                `- Framework: ${framework_id || 'Problem-Solution'}\n` +
                `- Tone: ${tone_of_voice_id || 'Professional'}\n` +
                `- Target Sections: ${outline_length || 6} H2s\n` +
                `- Intro Length: ${intro_length || 200} words\n` +
                `- Paragraph Length: ~${paragraph_length || 150} words\n\n` +
                `[CONTEXT]:\n` +
                `${search_intent}\n\n` +
                `${competitor_analysis}`
            ),
            new HumanMessage(
                `Create a complete, production-ready outline for: **"${primary_keyword}"**\n\n` +
                `**MANDATORY STRUCTURE:**\n\n` +
                `# [H1: Compelling Title with "${primary_keyword}"]\n\n` +
                `*(2-3 sentence intro preview: scope + value proposition)*\n\n` +
                `---\n\n` +
                `## [H2 1: Core Answer to #1 User Question]\n` +
                `**Methodology:**\n` +
                `- **Format:** [Step-by-step list/Table/Case study/Pros-Cons]\n` +
                `- **Word Count:** [Estimated range, e.g., 300-400]\n` +
                `- **Core Content:**\n` +
                `  1. [Specific point/data/example]\n` +
                `  2. [Specific point/data/example]\n` +
                `  3. [Specific point/data/example]\n` +
                `- **E-E-A-T:** [How to show expertise: cite source, add stats, include example]\n` +
                `- **Internal Link:** [Suggest related topic]\n\n` +
                `### [H3 1.1: Specific Substep]\n` +
                `### [H3 1.2: Specific Substep]\n\n` +
                `---\n\n` +
                `## [H2 2: Deep Dive Topic]\n` +
                `**Methodology:**\n` +
                `... [Repeat for ALL ${outline_length || 6} H2 sections]\n\n` +
                `---\n\n` +
                `**OUTLINE QUALITY CHECKLIST:**\n` +
                `✅ MECE principle (no overlap, complete coverage)\n` +
                `✅ Addresses ALL user questions from intent analysis\n` +
                `✅ Fills competitor content gaps\n` +
                `✅ Each H2 has clear methodology\n` +
                `✅ Specific data points/examples mentioned\n` +
                `✅ ${outline_length || 6} substantive H2 sections (NO generic conclusion)\n` +
                `✅ Logical flow: urgent questions first → advanced topics last\n\n` +
                `**Output language:** ${output_language}\n` +
                `**Output format:** Clean Markdown with proper formatting`
            )
        ];

        const response = await this.model.invoke(messages);
        console.log('✅ Detailed Outline created\n');
        return response.content;
    }

    // ✅ Agent 4: Generate Content (SEO-Optimized HTML)
    async generateContent(params) {
        const {
            primary_keyword,
            semantic_keywords,
            outline_used,
            title_content,
            meta_description,
            article_type,
            tone_of_voice_id,
            intro_length,
            paragraph_length,
            target_word_count,
            output_language
        } = params;
        
        console.log('🤖 Agent 4: Generating SEO-Optimized HTML Content...');

        const ragContext = await this.getRagContext(
            `Detailed content and examples for: ${primary_keyword}`,
            'content',  // ← queryType: 'content' for detailed explanations
            7
        );

        const systemPrompt = ragContext
            ? `[ROLE]: Expert SEO Content Writer & HTML Specialist\n` +
              `[GOAL]: Create HTML scoring 90+/100 on SEO analyzers\n` +
              `[REFERENCE_CONTENT]:\n${ragContext}\n\n` +
              `[INSTRUCTIONS]: \n` +
              `1. Use provided reference content for accurate data & examples\n` +
              `2. Cite or paraphrase the reference when using specific information\n` +
              `3. Maintain ${target_word_count || 2000} word count\n`
            : `[ROLE]: Expert SEO Content Writer & HTML Specialist\n` +
              `[GOAL]: Create HTML scoring 90+/100 on SEO analyzers\n`;


        const messages = [
            new SystemMessage(
                systemPrompt +
                `[TONE]: ${tone_of_voice_id || 'Professional'}\n` +
                `[TYPE]: ${article_type || 'Guide'}\n` +
                `[TARGET]: ${target_word_count || 2000} words`
            ),
            new HumanMessage(
                `Write complete HTML article for: **"${primary_keyword}"**\n\n` +
                `**TITLE:** ${title_content}\n` +
                `**META:** ${meta_description}\n\n` +
                `**OUTLINE TO FOLLOW:**\n${outline_used.substring(0, 3000)}\n\n` +
                `**CRITICAL SEO REQUIREMENTS:**\n\n` +
                `### 1. META ELEMENTS\n` +
                `<!-- SUGGESTED_URL: /${primary_keyword.toLowerCase().replace(/\s+/g, '-')} -->\n` +
                `<!-- META_DESCRIPTION: "${meta_description}" -->\n\n` +
                `### 2. KEYWORD PLACEMENT\n` +
                `- H1: Include "${primary_keyword}"\n` +
                `- First H2: MUST contain exact keyword\n` +
                `- First 100 words: Include keyword naturally\n` +
                `- At least 1 H3: Include keyword variation\n` +
                `- Last paragraph: Include keyword\n` +
                `- Keyword density: 1.0-1.5%\n\n` +
                `### 3. STRUCTURE\n` +
                `1. <h1>${title_content}</h1>\n` +
                `2. Intro (${intro_length} words, keyword in first paragraph)\n` +
                `3. Key Takeaways box\n` +
                `4. Table of Contents (clickable, AFTER Key Takeaways)\n` +
                `5. Main content (follow outline)\n` +
                `6. FAQ section\n` +
                `7. Conclusion with keyword\n\n` +
                `### 4. IMAGES (5-7 required)\n` +
                `<figure style="margin: 25px 0; text-align: center;">\n` +
                `  <img src="[image-url]" \n` +
                `       alt="[2 images MUST have '${primary_keyword}' in alt]" \n` +
                `       loading="lazy">\n` +
                `  <figcaption>Caption</figcaption>\n` +
                `</figure>\n\n` +
                `### 5. LINKS\n` +
                `- Internal: 2-3 with descriptive anchors\n` +
                `- External: 2 authority sites (rel="noopener")\n\n` +
                `### 6. READABILITY\n` +
                `- MAX 3 sentences per paragraph (${paragraph_length} words avg)\n` +
                `- Use transition words\n` +
                `- Bullet lists for clarity\n\n` +
                `**OUTPUT:** Clean HTML in ${output_language}, production-ready`
            )
        ];

        const response = await this.model.invoke(messages);
        console.log('✅ HTML Content generated\n');
        return response.content;
    }

    // Generate Title + Meta
    async generateTitleMeta(params) {
        const { primary_keyword, semantic_keywords, search_intent, output_language } = params;
        
        console.log('🤖 Quick: Generating Title & Meta...');

        const messages = [
            new SystemMessage('SEO Copywriter: craft high-CTR titles & descriptions'),
            new HumanMessage(
                `Create title + meta for: "${primary_keyword}"\n` +
                `Context: ${semantic_keywords}\n` +
                `Intent: ${search_intent.substring(0, 300)}\n\n` +
                `Requirements:\n` +
                `- Title: 50-60 chars, include keyword, power words (2025, Ultimate, Complete)\n` +
                `- Meta: 150-160 chars, keyword + CTA\n` +
                `- Output JSON: {"title": "...", "meta_description": "..."}\n` +
                `- Language: ${output_language}`
            )
        ];

        const response = await this.lightModel.invoke(messages);
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        return jsonMatch ? JSON.parse(jsonMatch[0]) : {
            title: primary_keyword,
            meta_description: `Complete guide to ${primary_keyword}`
        };
    }
}

module.exports = new AIService();