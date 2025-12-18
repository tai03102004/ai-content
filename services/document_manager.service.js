const fs = require('fs').promises;
const path = require('path');

class DocumentManagerService {
    constructor() {
        this.docsPath = path.join(__dirname, '../docs');
        this.cache = new Map();
        this.lastModified = new Map();
    }

    // Đọc document với cache
    async getDocument(filename) {
        try {
            const filePath = path.join(this.docsPath, filename);
            const stats = await fs.stat(filePath);
            const currentModified = stats.mtime.getTime();

            // Check cache
            const cachedModified = this.lastModified.get(filename);
            if (cachedModified === currentModified && this.cache.has(filename)) {
                console.log(`📚 [Cache] ${filename}`);
                return this.cache.get(filename);
            }

            // Read fresh
            console.log(`📖 [Loading] ${filename}`);
            const content = await fs.readFile(filePath, 'utf-8');

            // Update cache
            this.cache.set(filename, content);
            this.lastModified.set(filename, currentModified);

            return content;

        } catch (error) {
            console.error(`❌ Error reading ${filename}:`, error.message);
            throw new Error(`Document not found: ${filename}`);
        }
    }

    // Lấy tất cả guidelines cần thiết
    async getAllGuidelines() {
        try {
            const [
                googleGuidelines,
                outlineChecklist,
                seoBestPractices
            ] = await Promise.all([
                this.getDocument('google_helpful_content.md'),
                this.getDocument('outline_checklist.md')
            ]);

            return {
                googleGuidelines,
                outlineChecklist,
                seoBestPractices,
                combined: `${googleGuidelines}\n\n---\n\n${outlineChecklist}\n\n---\n\n${seoBestPractices}`
            };

        } catch (error) {
            console.error('❌ Error loading guidelines:', error);
            throw error;
        }
    }

    // Clear cache khi team update documents
    clearCache() {
        this.cache.clear();
        this.lastModified.clear();
        console.log('🧹 Document cache cleared');
    }
}

module.exports = new DocumentManagerService();