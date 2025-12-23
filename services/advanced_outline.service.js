const {
    ChatOpenAI
} = require('@langchain/openai');
const {
    HumanMessage,
    SystemMessage
} = require('@langchain/core/messages');
const perplexityService = require('./perplexity.service');
const documentManager = require('./document_manager.service');

class AdvancedOutlineService {
    constructor() {
        this.model = new ChatOpenAI({
            modelName: 'gpt-4.1-mini',
            temperature: 1,
            maxTokens: 10000,
            openAIApiKey: process.env.OPENAI_API_KEY,
            configuration: {
                baseURL: 'https://api.yescale.io/v1'
            }
        });
    }

    // Clean markdown text (remove headers, bold, citations)
    cleanMarkdown(text) {
        if (!text) return '';

        return text
            .replace(/^[#]+\s*/gm, '') // Remove ##, ###
            .replace(/^---+\s*$/gm, '') // Remove ---
            .replace(/\*\*/g, '') // Remove **
            .replace(/\[\d+\]/g, '') // Remove [1], [2]...
            .replace(/^\|-.*-\|$/gm, '') // Remove table separators
            .replace(/^\|\s*/gm, '') // Remove | at line start
            .replace(/\s*\|$/gm, '') // Remove | at line end
            .replace(/\s*\|\s*/g, ' | ') // Normalize table |
            .trim();
    }

    // Generate advanced outline với MCP + Think + Research
    async generateAdvancedOutline(projectData) {
        try {
            console.log('🎯 Starting Advanced Outline Generation...');

            console.log('📚 Step 1/3: Loading guidelines from documents...');
            const guidelines = await documentManager.getAllGuidelines();
            console.log('✅ Guidelines loaded successfully\n');

            // Step 2: Research bổ sung (nếu cần)
            let researchData = '';
            if (projectData.needsResearch) {
                researchData = await perplexityService.research(
                    `Research latest trends and data for: ${projectData.main_keyword} in ${projectData.output_language}`
                );
                console.log('✅ Step 2/4: Research data collected');
            }

            // Step 3: Clean data
            const cleanedOutline = this.cleanMarkdown(projectData.current_outline);
            const cleanedSearchIntent = this.cleanMarkdown(projectData.search_intent);
            console.log('✅ Step 3/4: Data cleaned');

            // Step 4: Generate outline với AI Agent
            console.log('🤖 Step 4/4: AI Agent generating outline...');

            const systemPrompt = `[Role]: Senior SEO Content Strategist.
                [Core Mission]: Transform a basic outline into a detailed, actionable blueprint that guarantees content supremacy. You follow the E-E-A-T and Helpful Content principles intrinsically.

                [Commandments for the Final Outline]:
                1. **Hierarchy is Logical:** H1 = Core Promise. H2s = Pillars fulfilling that promise. H3s = Actionable steps or deep dives.
                2. **MECE Principle:** Sections are Mutually Exclusive (no overlap) and Collectively Exhaustive (cover all aspects).
                3. **Front-Load Value:** The first H2s answer the most urgent user questions.
                4. **Methodology is Mandatory:** Every H2 must have a clear execution plan.

                [Input Context]:
                - Brand: "${projectData.brand_name}"
                - Main Keyword: "${projectData.main_keyword}"
                - LSI Keywords: "${projectData.lsi_keywords}"
                - Core Search Intent: ${projectData.search_intent}
                - Current Outline: ${cleanedOutline}
                ${researchData ? `- Research Data: ${researchData}` : ''}`;

            const userPrompt = `Using the input context and adhering strictly to the "Commandments," convert the provided outline into a complete, ready-to-write blueprint.

                **Output Instructions:**
                1. **Language:** ${projectData.output_language}.
                2. **Format:** Markdown.
                3. **Year:** 2025.
                
                **Final Output Must Have This Exact Structure:**
                
                # [H1: Final, Engaging Title]
                
                *(Brief 2-3 line introduction describing the article's scope and core value.)*
                
                ## [H2 1: First Pillar Section]
                **Article Methodology:**
                - **Content Format:** (e.g., Step-by-step numbered list, Comparative table, Narrative case study, Pros/Cons breakdown)
                - **Estimated Words:** (e.g., 300-400)
                - **Core Ideas to Cover:** (List 3-5 specific points, data points, or examples. Be concrete.)
                - **Connection to Intent:** (Explain how this directly addresses part of the search intent: "${projectData.search_intent}")
                - **Internal Link/CTA Opportunity:** (Suggest where to link to another article or add a call-to-action)
                
                ### [H3 1.1: Specific Sub-topic]
                ### [H3 1.2: Specific Sub-topic]
                
                ## [H2 2: Second Pillar Section]
                **Article Methodology:**
                ... (Repeat for all H2 sections)
                
                **[Important:** Do not write a "Conclusion" section in this outline. The final section should be a substantive H2.]`;

            const messages = [
                new SystemMessage(systemPrompt),
                new HumanMessage(userPrompt)
            ];

            const response = await this.model.invoke(messages);

            console.log('✅ Advanced Outline Generated Successfully!');
            return response.content;

        } catch (error) {
            console.error('❌ Advanced Outline Generation Error:', error);
            throw error;
        }
    }

    // Validate outline quality
    validateOutline(outline) {
        const checks = {
            hasH1: /^#\s+.+$/m.test(outline),
            hasMultipleH2: (outline.match(/^##\s+/gm) || []).length >= 3,
            hasH3: /^###\s+/m.test(outline),
            hasMethodology: /article methodology/i.test(outline) || /phương pháp/i.test(outline),
            hasWordCount: /word|từ|ước tính|estimated/i.test(outline),
            hasFormat: /format|định dạng/i.test(outline),
            hasExamples: /example|ví dụ|case study/i.test(outline),
            hasConnections: /connect|kết nối|link|previous|next/i.test(outline),
            hasSeparators: /^---+$/m.test(outline),
            sufficientLength: outline.length > 1500
        };

        const score = (Object.values(checks).filter(Boolean).length / Object.keys(checks).length * 100).toFixed(1);

        const details = {
            h1Count: (outline.match(/^#\s+/gm) || []).length,
            h2Count: (outline.match(/^##\s+/gm) || []).length,
            h3Count: (outline.match(/^###\s+/gm) || []).length,
            wordCount: outline.split(/\s+/).length,
            methodologyCount: (outline.match(/article methodology/gi) || []).length,
            sectionsWithMethodology: (outline.match(/\*\*Article Methodology:\*\*/gi) || []).length
        };

        return {
            isValid: Object.values(checks).every(check => check),
            checks,
            score: score + '%',
            details,
            recommendations: this.getRecommendations(checks, details)
        };
    }

    getRecommendations(checks, details) {
        const recommendations = [];

        if (!checks.hasH1) {
            recommendations.push('⚠️  Missing H1 main title');
        }
        if (!checks.hasMultipleH2) {
            recommendations.push('⚠️  Need at least 3 H2 sections for comprehensive coverage');
        }
        if (!checks.hasH3) {
            recommendations.push('⚠️  Add H3 subsections for better structure');
        }
        if (details.methodologyCount < details.h2Count) {
            recommendations.push('⚠️  Not all H2 sections have article methodology');
        }
        if (!checks.hasExamples) {
            recommendations.push('⚠️  Include specific examples or case studies');
        }
        if (!checks.hasConnections) {
            recommendations.push('⚠️  Explain how sections connect to each other');
        }

        if (recommendations.length === 0) {
            recommendations.push('✅ Outline meets all quality standards');
        }

        return recommendations;
    }
}

module.exports = new AdvancedOutlineService();