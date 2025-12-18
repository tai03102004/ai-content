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

            const systemPrompt = `[role]:
You are a Semantic SEO Expert knowledgeable about topical authority, semantic content, and Creating great Semantic SEO-friendly Content.

[Guidelines to Follow]:
${guidelines.combined}

[Information about the current outline content]:
${cleanedOutline}

[Search Intent of the Keywords]:
1. The Search Intent of the keyword is: ${projectData.muc_dich_tim_kiem}
2. Detailed search intent:
${cleanedSearchIntent}

[Source context of the brand]:
1. Brand name: "${projectData.brand_name}"
2. Main Keyword: "${projectData.main_keyword}"
3. LSI Keywords: "${projectData.lsi_keywords}"

${researchData ? `[Research Data]:\n${researchData}\n\n` : ''}

[Task/Instruction]:
Your task is to Re-optimize, adjust or develop a detailed outline based on the current outline and ensure the guidelines below.

[Guidelines for the outline]:
I/ Structure & Flow:
- Outline proceeds from main theme ensuring contextual flow, vectors, hierarchy, and coverage
- Must satisfy user intent
- One H1 as central theme
- H2 sections elaborate on H1
- H3 breaks down H2 logically
- Contextually coherent progression

II/ Content Segmentation:
- Main Content: >80% comprehensive coverage
- Supplemental Content: <20% additional insights
- Seamless contextual bridge

III/ Optimization Criteria:
- First 10 headings answer pressing questions
- Group related headings together
- Supplemental content includes Boolean, Definitional, Grouping, Comparative questions
- No conclusion in outline

IV/ Contextual Harmony:
- Maintain heading hierarchy harmony
- First and last headings interconnected via synonyms/antonyms
- Use incremental lists where appropriate

V/ Content Quality & Expertise:
- Demonstrate high expertise and detail
- Authoritative and credible
- Meet user's search intent
- Surpass competitors in depth & quality

[Guidelines for the article methodology]:
For each section/heading, provide:
- Content format (bullet points, paragraphs, tabular)
- Estimated words
- Main Ideas (content to include for context coverage)
- Examples, data, or evidence to include
- How this section connects to others`;

            const userPrompt = `Based on the Google Helpful Content & the Checklist Outline & Article Methodology that you have been provided in the MCP_Checklist_Semantic_Content, I want you to create a complete outline for a blog post.

Please provide a complete outline with a detailed article methodology for each section.

[final reminder]:
1. Output should be in ${projectData.output_language}
2. The output should be in Markdown format to allow easy copy & paste to Google Docs
3. If the outline has a list, like a 30+ checklist or 30+ benefits, try to include the full 30+ checklist in the outline or the output of it
4. This is the year 2025
5. The output should only contain the outline & article methodology of the blog post/content

[Example output structure]:
# [Main Title with H1]

[Introduction section with article methodology]

## [H2 Section Title]

**Article Methodology:**
- Content format: Paragraphs + bullet points
- Estimated words: 250-300
- Main ideas: [specific ideas]
- Examples/data: [specific examples]
- Connection: Links to next section about...

### [H3 Subsection]
### [H3 Subsection]

## [H2 Section Title]
...`;

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