const {
    DataTypes
} = require('sequelize');
const sequelize = require("../dbs/database");


const ContentModel = sequelize.define(
    'Content', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },

        outline_id: {
            type: DataTypes.INTEGER,
            references: {
                model: 'outline',
                key: 'id'
            },
            onDelete: 'SET NULL',
            comment: 'Optional reference to outline'
        },

        brand_name: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },

        primary_keyword: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },

        secondary_keywords: {
            type: DataTypes.TEXT,
            get() {
                const value = this.getDataValue('secondary_keywords');
                return value ? JSON.parse(value) : [];
            },
            set(value) {
                this.setDataValue('secondary_keywords', JSON.stringify(value));
            }
        },

        semantic_keywords: {
            type: DataTypes.TEXT,
        },

        search_intent_analysis: {
            type: DataTypes.TEXT,
            comment: 'AI-generated intent analysis'
        },

        // Content Strategy
        article_type: {
            type: DataTypes.STRING(100),
            comment: 'Guide, Tutorial, Comparison, Review, Listicle'
        },

        framework_id: {
            type: DataTypes.STRING(50),
            comment: 'AIDA, PAS, FAB, Problem-Solution'
        },

        point_of_view_id: {
            type: DataTypes.STRING(50),
            comment: 'first-person, second-person, third-person'
        },

        tone_of_voice_id: {
            type: DataTypes.STRING(50),
            comment: 'professional, friendly, authoritative, casual'
        },

        output_language: {
            type: DataTypes.STRING(50),
        },

        // Content Config
        intro_length: {
            type: DataTypes.INTEGER,
            defaultValue: 200
        },
        paragraph_length: {
            type: DataTypes.INTEGER,
            defaultValue: 150
        },
        target_word_count: {
            type: DataTypes.INTEGER,
            defaultValue: 2000
        },

        outline_used: {
            type: DataTypes.TEXT,
            comment: 'Final outline used for content generation'
        }

    }, {
        tableName: 'content',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        underscored: true,
    }
);

module.exports = ContentModel;