const axios = require('axios');

class OpenAIService {
    constructor() {
        this.apiKey = process.env.OPENAI_API_KEY;
        this.baseURL = 'https://api.yescale.io/v1/chat/completions';
    }

    async analyzeSearchIntent(mainKeyword, lsiKeywords, outputLanguage) {
        try {
            const response = await axios.post(
                `${this.baseURL}`, {
                    model: 'gpt-4.1-mini-2025-04-14',
                    messages: [{
                            role: 'system',
                            content: '[Instruction]: Answer in Markdown format with clear structure, bullet points, and short paragraphs.\n\n[Role]: You are a Researcher & Semantic SEO Expert who is a master of the Topical Authority Concept from Koray. Your task is to analyse the Search Intent behind the query.'
                        },
                        {
                            role: 'user',
                            content: `Analyse the query: [${mainKeyword} including related terms ${lsiKeywords}]; what would users be looking for if they searched it? Determine the search intent on Google and explain how to fully satisfy it. Prioritise content in *${outputLanguage}* but also provide English examples if relevant.\n\n### Output Language:\n*${outputLanguage}*`
                        }
                    ],
                    temperature: 1,
                    max_tokens: 10000
                }, {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return response.data.choices[0].message.content;

        } catch (error) {
            console.error('Error in analyzeSearchIntent:', error.response?.data || error.message);
            throw new Error(`OpenAI API Error: ${error.response?.data?.error?.message || error.message}`);
        }
    }
}

module.exports = new OpenAIService();