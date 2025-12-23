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
            modelName: 'gpt5',
            temperature: 1,
            maxTokens: 25000,
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
                new SystemMessage(`You are a master SEO copywriter. Your sole purpose is to craft meta titles and descriptions that achieve maximum click-through rate (CTR) by combining keyword precision with compelling, benefit-driven messaging and psychological triggers.`),
                new HumanMessage(`Create the SINGLE BEST Title and Meta Description pair for the following topic:
                    - **Main Keyword:** "${mainKeyword}"
                    - **Search Intent:** ${searchIntent}
                    - **Topic Context/About:** "${lsiKeywords}"
            
                    **Strict Requirements:**
                    1. **Title (50-60 characters):**
                        - MUST include "${mainKeyword}".
                        - Start with a powerful hook (e.g., "2025 Guide", "The Truth About", "[Number] Ways To").
                        - Clearly promise a specific outcome, solution to a pain point, or unique benefit.
                    2. **Meta Description (150-160 characters):**
                        - MUST include "${mainKeyword}" and at least 1 term from "${lsiKeywords}".
                        - Structure: [First 10-12 words: Hook with a micro-promise or question] + [Middle: State the unique value/solution] + [End: Strong, actionable CTA (e.g., "Learn how...", "Discover...")].
                        - Create curiosity while being truthful.
            
                    **Output Format (JSON ONLY):**
                    {
                        "title": "Your title here",
                        "meta_description": "Your meta description here"
                    }
                    `)
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
                new SystemMessage(`[Role]: You are a Senior Search Intent Analyst specializing in Koray's Topical Authority. Your analysis is the foundation for all content strategy.
                    [Instruction]: Provide analysis in clear, structured Markdown. Use bullet points and concise paragraphs.`),
                new HumanMessage(`Conduct a comprehensive search intent analysis for the query: **"${mainKeyword}"** (including related concepts: ${lsiKeywords}).
                    
                    **Follow this exact analysis framework:**
                    
                    ### 1. Intent Classification
                    Categorize the primary and secondary intent: Informational, Commercial, Navigational, or Transactional. Justify your choice.
                    
                    ### 2. User Persona & Questions
                    - **Who is searching for this?** (Beginner, professional, problem-haver, researcher?)
                    - **What specific questions must the perfect article answer?** List 5-7 core questions.
                    
                    ### 3. Content Depth & Format Expectation
                    What content format (List, Guide, Comparison, Review) and depth (Basic overview, Step-by-step tutorial, Advanced analysis) does the user expect?
                    
                    ### 4. Semantic & Topical Map
                    List 5-10 essential subtopics or related entities (beyond "${lsiKeywords}") that a topically authoritative article MUST cover to satisfy this intent fully.
                    
                    **Output Language:** ${outputLanguage}
                `)
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
                new SystemMessage(`[Role]: You are an SEO Competitive Intelligence Analyst.
                    [Instruction]: Provide analysis in structured Markdown. Be critical and strategic.
                    [Context]: The user's search intent for "${mainKeyword}" is: ${searchIntent}`),
                new HumanMessage(`**Task:** Analyze the provided competitor content landscape for the query: **"${mainKeyword}"**.
                    
                    **Methodology:** For the top 3-5 competitor articles (assume URLs/content are provided), evaluate them against these criteria:
                    
                    ### A. Structural & Content Analysis
                    - **Outline Effectiveness:** What H2/H3 structure do they use? Is it logical and comprehensive (MECE)?
                    - **Content Depth:** Where do they go deep? Where are they shallow? Identify missing steps or explanations.
                    
                    ### B. E-E-A-T & Credibility Assessment
                    - **Expertise:** How do they demonstrate knowledge? (Data, case studies, detailed processes?)
                    - **Authoritativeness:** Do they cite sources, include expert quotes, or show first-hand experience?
                    - **Trust:** How do they build trust? (Transparency, addressing drawbacks, clear methodology?)
                    
                    ### C. Gap & Opportunity Identification
                    - **Intent Gaps:** What user questions (from the Intent Analysis) do they fail to answer?
                    - **Content Gaps:** What related subtopics or angles are completely missing?
                    - **Weaknesses:** What is confusing, outdated, or poorly explained?
                    
                    **Synthesize findings into a final "Blueprint for Victory":**
                    - **3-5 Non-Negotiable Sections** our article MUST have.
                    - **2-3 Areas to Go Deeper** than all competitors.
                    - **1 Unique Angle** to differentiate our content.
                    
                **Output Language:** ${outputLanguage}
            `)
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
    async createOutlineAgent(searchIntent, competitorAnalysis, outputLanguage, mainKeyword) {
        try {
            console.log('🤖 Agent 3: Creating Outline...');

            const messages = [
                new SystemMessage(`[Role]: You are an SEO Content Architect. Your job is to synthesize research into a winning content blueprint.
                    [Core Inputs]:
                    1. Search Intent Analysis: ${searchIntent}
                    2. Competitor Analysis Summary: ${competitorAnalysis}
                    [Instruction]: Create a structured, comprehensive outline in Markdown.`),
                new HumanMessage(`Using the provided Search Intent and Competitor Analysis, create the initial strategic outline for an article targeting **"${mainKeyword}"**.
                    
                    **Directive:** This is a FIRST DRAFT outline. Focus on **comprehensive structure and logic**, not final wording. Your goal is to ensure no key question from the intent analysis is left unanswered and that we strategically cover gaps identified in competitors.
                    
                    **Outline Requirements:**
                    1. **H1:** Provide one compelling main title.
                    2. **H2s (3-5):** Create pillar sections that directly map to the core user questions and intent. Label them logically.
                    3. **H3s:** For each H2, suggest 2-4 sub-sections (H3s) that break down the topic.
                    4. **Key Elements to Note:** Bullet points under key H2/H3s mentioning "Include data here," "Add comparison table," "Case study needed."
                    5. **DO NOT** write full sentences or methodology here. This is a structural skeleton.
                    
                    **Output Language:** ${outputLanguage}
                `)
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
                    `[ROLE]: You are a Senior SEO Content Strategist and Outline Architect.
            [PRIMARY GOAL]: Transform a basic content outline into a detailed, battle-ready blueprint designed to DOMINATE search results by being more helpful, comprehensive, and authoritative than any competitor.
            [CORE PRINCIPLES]: Your blueprint must intrinsically follow Google's E-E-A-T (Expertise, Experience, Authoritativeness, Trustworthiness) and Helpful Content guidelines.
            
            [INPUT CONTEXT YOU MUST USE]:
            1. **Brand Voice:** ${projectData.brand_name}
            2. **Target Keyword:** "${projectData.main_keyword}"
            3. **Topic Context (LSI):** "${projectData.lsi_keywords}"
            4. **User's Core Goal (Search Intent):** ${projectData.search_intent}
            5. **Current Draft Outline:** ${outline}
            
            [TASK]: Critically analyze the "Current Draft Outline." Then, rebuild it into a superior, detailed blueprint following the strict "Blueprint Framework" below.`
                ),
                new HumanMessage(
                    `Using the provided context, rebuild the outline into a complete, ready-to-write blueprint. Your output must satisfy the **user's search intent** and create a page that is the **best possible answer** to their query.
            
            **Follow this exact BLUEPRINT FRAMEWORK:**
            
            ### **A. STRUCTURAL RULES (Non-negotiable)**
            1.  **Hierarchy Logic:** H1 = Ultimate Promise. Each H2 = A core pillar that fulfills that promise. H3s = Specific, actionable steps or deep explanations under each pillar.
            2.  **MECE Principle:** Ensure sections are **Mutually Exclusive** (no overlap) and **Collectively Exhaustive** (cover all critical aspects of the topic).
            3.  **Value-First Flow:** The first 2-3 H2s must answer the user's most urgent, fundamental questions immediately. Save advanced or supplemental details for later.
            4.  **No Generic Conclusions:** The final H2 should be a substantive section (e.g., "Advanced Tips," "Common Pitfalls to Avoid"), NOT a generic "Conclusion."
            
            ### **B. CONTENT DEPTH & E-E-A-T REQUIREMENTS**
            For **each H2 section**, you MUST specify an **"Article Methodology"** that includes:
            - **Content Format:** (e.g., "Step-by-Step Numbered List," "Comparative Data Table," "Case Study Analysis," "Pros/Cons Breakdown with Expert Quotes").
            - **Estimated Word Count:** (A realistic range, e.g., 300-400 words).
            - **Core Ideas/Data to Cover:** (List 3-5 concrete points, examples, statistics, or data sources to include. Be specific. If it's a list of 30 items, note "Comprehensive checklist of 30+ items").
            - **E-E-A-T Execution:** (Explain *how* this section will demonstrate expertise or build trust, e.g., "Cite 2025 industry report from [Source]," "Include a real-user case study," "Provide a downloadable template").
            
            ### **C. FINAL OUTPUT FORMAT**
            Your entire response must be in **${projectData.output_language}** and use this exact Markdown structure:
            
            # [H1: Compelling, Benefit-Driven Title with "${projectData.main_keyword}"]
            
            *(A 2-3 sentence introduction defining the article's scope and core value proposition.)*
            
            ## [H2 1: Core Answer to the #1 User Question]
            **Article Methodology:**
            - **Format:** [Specify format]
            - **Word Count:** [Specify range]
            - **Core Ideas:** [List specific ideas, data, examples]
            - **E-E-A-T:** [Explain how you'll demonstrate expertise/trust here]
            - **Internal Link/CTA Hook:** [Suggest a related topic to link to]
            
            ### [H3 1.1: Specific step or sub-topic]
            ### [H3 1.2: Specific step or sub-topic]
            
            ## [H2 2: Deep Dive into Secondary Need]
            **Article Methodology:**
            ... *(Repeat for all H2 sections)*
            
            *(Do not add a "Conclusion" H2. End with your last substantive pillar section.)*`
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
                new SystemMessage(`[ROLE]: Expert SEO Content Writer & HTML Specialist
            [GOAL]: Create HTML content that scores 90+/100 on SEO analyzers
            [CORE PRINCIPLES]: 
            1. Strictly follow ALL technical SEO requirements
            2. Prioritize user experience and readability
            3. Output clean, production-ready HTML`),

                new HumanMessage(`**TOPIC:** Write a complete, SEO-optimized HTML article about: **"${projectData.main_keyword}"**
            
            **OUTPUT LANGUAGE:** ${projectData.output_language}
            **CONTENT LENGTH:** 600-2500 words
            
            === ESSENTIAL SEO REQUIREMENTS (NON-NEGOTIABLE) ===
            
            **1. META ELEMENTS (Place at top):**
            <!-- SUGGESTED_URL: /[keyword-as-url] (max 60 chars, hyphens) -->
            <!-- META_DESCRIPTION: "[Main keyword within first 155 chars. Compelling description.]" -->
            
            **2. KEYWORD IMPLEMENTATION:**
            - H1: Must contain "${projectData.main_keyword}" naturally
            - First 100 words: Include main keyword
            - First H2: Must contain exact main keyword or close variation
            - At least 1 H3: Include keyword variation
            - Last paragraph: Include keyword for closure
            - Keyword density: 0.8-1.5% (natural distribution)
            - URL: Include main keyword (see SUGGESTED_URL above)
            
            **3. CONTENT STRUCTURE:**
            1. <h1>Main Title (includes keyword)</h1>
            2. Introduction (150-200 words, keyword in first paragraph)
            3. Key Takeaways Box (styled div with 4-5 bullet points)
            4. Table of Contents (clickable, after Key Takeaways, NOT at end)
            5. Main Content (follow outline: ${projectData.outline_result})
            6. FAQ Section (optional but recommended)
            7. Conclusion (keyword in final paragraph)
            
            **4. IMAGE REQUIREMENTS (5-7 unique images):**
            <figure style="margin: 25px 0; text-align: center;">
                <img src="https://images.unsplash.com/photo-[UNIQUE-ID-HERE]?w=1200" 
                     alt="[Descriptive alt - 2 MUST contain '${projectData.main_keyword}']" 
                     loading="lazy"
                     style="max-width: 100%; height: auto; border-radius: 8px;">
                <figcaption style="font-size: 14px; color: #666; margin-top: 8px;">Caption here</figcaption>
            </figure>
            
            **5. LINKING STRATEGY:**
            - Internal Links: 2-3 links with descriptive anchor text
            - External Links: 2 authoritative dofollow links (rel="noopener")
            - All links open in same tab except external (use target="_blank")
            
            **6. READABILITY RULES (STRICT):**
            - MAX paragraph length: 3 sentences (50-60 words)
            - Use transition words in every paragraph
            - Break content with: bullets, numbered lists, subheadings
            - Table of Contents REQUIRED for long-form content
            
            === TECHNICAL OUTPUT SPECIFICATIONS ===
            
            **HTML STRUCTURE:**
            <article itemscope itemtype="https://schema.org/Article" style="max-width: 800px; margin: 0 auto; font-family: system-ui; line-height: 1.7;">
            
                <!-- Meta comments here -->
                
                <h1 style="font-size: 36px; margin-bottom: 20px;">[Title with keyword]</h1>
                
                <!-- Introduction -->
                <p style="font-size: 18px; margin-bottom: 15px;">[...keyword in first 100 words...]</p>
                
                <!-- Key Takeaways -->
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px; border-radius: 12px; margin: 30px 0;">
                    <h2 style="color: white; margin-bottom: 15px;">✨ Key Takeaways</h2>
                    <ul style="margin: 0; padding-left: 20px;">
                        <li>Point 1</li>
                        <li>Point 2</li>
                        <li>Point 3</li>
                    </ul>
                </div>
                
                <!-- Table of Contents -->
                <nav style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 30px 0;">
                    <h2 style="font-size: 18px; margin-bottom: 15px;">📑 Table of Contents</h2>
                    <ol style="margin: 0; padding-left: 20px;">
                        <li><a href="#section-1" style="color: #2563eb;">Section 1</a></li>
                        <!-- Add all H2s -->
                    </ol>
                </nav>
                
                <!-- Main Content Here -->
                
                <!-- FAQ Section -->
                <h2 id="faq" style="font-size: 28px; margin: 40px 0 20px;">❓ Frequently Asked Questions</h2>
                
                <!-- Conclusion -->
                <p style="margin: 30px 0; font-size: 18px; font-weight: 500;">
                    In summary, <strong>${projectData.main_keyword}</strong> [final value statement].
                </p>
                
            </article>
            
            === FINAL CHECKLIST (90+ SCORE REQUIREMENTS) ===
            
            ✅ TECHNICAL (20 points):
            - [ ] Clean URL with keyword
            - [ ] Meta description with keyword (<160 chars)
            - [ ] Proper schema markup (Article)
            - [ ] Mobile-responsive styling
            
            ✅ CONTENT (40 points):
            - [ ] Keyword in: H1, first H2, first paragraph, last paragraph
            - [ ] 1.0-1.5% keyword density (natural)
            - [ ] Follows outline: ${projectData.outline_result}
            - [ ] 600-2500 words total length
            
            ✅ USER EXPERIENCE (30 points):
            - [ ] Table of Contents present (after Key Takeaways)
            - [ ] Short paragraphs ONLY (max 3 sentences)
            - [ ] 5-7 unique images with optimized alt text
            - [ ] Bullet points and lists for readability
            - [ ] FAQ section included
            
            ✅ LINKING (10 points):
            - [ ] 2-3 internal links with descriptive anchors
            - [ ] 2 external dofollow links to authority sites
            - [ ] All images have loading="lazy"
            
            **CRITICAL OUTPUT RULES:**
            1. NO escaped characters (\\n, \\t, \\") - use actual line breaks
            2. NO <meta> tags inside <article> body
            3. All images must have DIFFERENT Unsplash IDs
            4. First H2 MUST contain main keyword
            5. ToC positioned AFTER Key Takeaways box
            6. Output ONLY the HTML article content
            
            **REMINDER:** Balance SEO requirements with natural, helpful content. The goal is to help users first, optimize for search second.`)
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