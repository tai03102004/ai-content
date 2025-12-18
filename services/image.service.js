const {
    createApi
} = require('unsplash-js');

class ImageService {
    constructor() {
        this.unsplash = createApi({
            accessKey: process.env.UNSPLASH_ACCESS_KEY || 'YOUR_KEY',
            fetch: fetch
        });

        // Fallback images
        this.fallbackImages = {
            'technology': 'https://images.unsplash.com/photo-1518770660439-4636190af475',
            'business': 'https://images.unsplash.com/photo-1460925895917-afdab827c52f',
            'marketing': 'https://images.unsplash.com/photo-1432888498266-38ffec3eaf0a',
            'ai': 'https://images.unsplash.com/photo-1677442136019-21780ecad995',
            'default': 'https://images.unsplash.com/photo-1519389950473-47ba0277781c'
        };
    }

    async searchImage(keyword) {
        try {
            const result = await this.unsplash.search.getPhotos({
                query: keyword,
                page: 1,
                perPage: 3,
                orientation: 'landscape'
            });

            if (result.errors || !result.response?.results?.length) {
                return this.getFallbackImage(keyword);
            }

            const photo = result.response.results[0];
            return {
                url: photo.urls.regular,
                alt: photo.alt_description || keyword,
                credit: `Photo by ${photo.user.name} on Unsplash`
            };

        } catch (error) {
            return this.getFallbackImage(keyword);
        }
    }

    getFallbackImage(keyword) {
        const lowerKeyword = keyword.toLowerCase();

        for (const [key, url] of Object.entries(this.fallbackImages)) {
            if (lowerKeyword.includes(key)) {
                return {
                    url,
                    alt: keyword,
                    credit: 'Photo from Unsplash'
                };
            }
        }

        return {
            url: this.fallbackImages.default,
            alt: keyword,
            credit: 'Photo from Unsplash'
        };
    }

    async replaceImagePlaceholders(content) {
        try {
            const pattern = /<!-- IMAGE_PLACEHOLDER:\s*"([^"]+)"\s*-->/g;
            const matches = [...content.matchAll(pattern)];

            if (matches.length === 0) {
                console.log('ℹ️  No image placeholders found');
                return content;
            }

            console.log(`🎨 Processing ${matches.length} images...`);
            let updatedContent = content;

            for (let i = 0; i < matches.length; i++) {
                const [fullMatch, keyword] = matches[i];

                console.log(`  [${i+1}/${matches.length}] Searching: "${keyword}"`);
                const imageData = await this.searchImage(keyword);

                // ✨ Generate SEO-optimized HTML figure with lazy loading
                const imageHtml = `<figure class="wp-block-image size-large" style="margin: 2em 0;">
    <img 
        src="${imageData.url}" 
        alt="${imageData.alt}" 
        loading="lazy"
        decoding="async"
        width="1200"
        height="675"
        style="width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"
    />
    <figcaption style="font-size: 14px; color: #666; text-align: center; margin-top: 8px; font-style: italic;">
        Photo by <a href="${imageData.photographerUrl}" target="_blank" rel="noopener noreferrer" style="color: #0073aa; text-decoration: none;">${imageData.photographer}</a> on <a href="https://unsplash.com" target="_blank" rel="noopener noreferrer" style="color: #0073aa; text-decoration: none;">Unsplash</a>
    </figcaption>
</figure>`;

                updatedContent = updatedContent.replace(fullMatch, imageHtml);

                // Rate limit
                if (i < matches.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            console.log(`✅ All ${matches.length} images inserted\n`);
            return updatedContent;

        } catch (error) {
            console.error('❌ Error replacing images:', error.message);
            return content;
        }
    }
}

module.exports = new ImageService();