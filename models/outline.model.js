const {
    DataTypes
} = require('sequelize');
const sequelize = require("../dbs/database");


const OutlineModel = sequelize.define(
    'Outline', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
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

         // Outline Config
        outline_length: {
            type: DataTypes.INTEGER,
            defaultValue: 6,
            comment: 'Target H2 sections count'
        },
        intro_length: {
            type: DataTypes.INTEGER,
            defaultValue: 200,
            comment: 'Target intro word count'
        },
        paragraph_length: {
            type: DataTypes.INTEGER,
            defaultValue: 150,
            comment: 'Average paragraph word count'
        },

        outline_result: {
            type: DataTypes.TEXT('long'),
            comment: 'Generated outline in Markdown'
        },

        competitor_analysis: {
            type: DataTypes.TEXT('long'),
        },

        title_content: {
            type: DataTypes.STRING(255),
        },

        meta_description: {
            type: DataTypes.STRING(300),
        },

        // Status
        status: {
            type: DataTypes.ENUM('draft', 'processing', 'completed', 'failed'),
            defaultValue: 'draft'
        }

    }, {
        tableName: 'outline',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        underscored: true,
    }
);

module.exports = OutlineModel;