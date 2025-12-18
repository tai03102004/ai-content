const {
    DataTypes
} = require('sequelize');
const sequelize = require("../dbs/database");


const ContentPlanning = sequelize.define(
    'ContentPlanning', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },

        brand_name: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },

        main_keyword: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },

        lsi_keywords: {
            type: DataTypes.TEXT,
        },

        secondary_keywords: {
            type: DataTypes.TEXT,
        },

        output_language: {
            type: DataTypes.STRING(50),
        },

        muc_dich_tim_kiem: {
            type: DataTypes.STRING(255),
        },

        status_writing: {
            type: DataTypes.STRING(50),
        },

        style_of_writing: {
            type: DataTypes.STRING(100),
        },

        tone_of_voice: {
            type: DataTypes.STRING(100),
        },

        search_intent: {
            type: DataTypes.TEXT('long'),
        },

        competitor_analysis: {
            type: DataTypes.TEXT('long'),
        },

        outline_result: {
            type: DataTypes.TEXT('long'),
        },

        title_content: {
            type: DataTypes.STRING(255),
        },

        meta_description: {
            type: DataTypes.STRING(300),
        },

        link_outline: {
            type: DataTypes.STRING(500),
        },

        content: {
            type: DataTypes.TEXT('long'),
        },

        link_wordpress: {
            type: DataTypes.STRING(500),
        },

        type: {
            type: DataTypes.STRING(50),
        },
    }, {
        tableName: 'content_planning',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        underscored: true,
    }
);

module.exports = ContentPlanning;