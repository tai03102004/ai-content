const axios = require('axios');

class PerplexityService {
    constructor() {
        this.apiKey = process.env.OPENAI_API_KEY; // Sử dụng YeScale
        this.baseURL = 'https://api.yescale.io/v1';
    }

    // Research tool: Tìm kiếm thông tin mới nhất
    async research(query, maxCalls = 3) {
        try {
            console.log(`🔍 Perplexity Research: ${query.substring(0, 50)}...`);

            const response = await axios.post(
                `${this.baseURL}/chat/completions`, {
                    model: 'gpt-4.1-mini-2025-04-14',
                    messages: [{
                            role: 'system',
                            content: 'You are a Semantic SEO Expert who is a master of the Topical Authority Concept from Koray. Your task is to analyze the competitor\'s content outline or a specific URL based on the provided query.'
                        },
                        {
                            role: 'user',
                            content: query
                        }
                    ],
                    temperature: 0.8,
                    max_tokens: 10000
                }, {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('✅ Research completed');
            return response.data.choices[0].message.content;

        } catch (error) {
            console.error('❌ Perplexity Research Error:', error.message);
            throw error;
        }
    }
}

module.exports = new PerplexityService();