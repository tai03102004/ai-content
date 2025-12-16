require('dotenv').config();
var express = require('express');
var app = express();
var sequelize = require('./dbs/database');

const aiRouter = require("./routes/ai_content.route")

// Middleware
app.use(express.json());
app.use(express.urlencoded({
    extended: true
}));

sequelize;

// Routes
app.use('/api/ai-content', aiRouter);

app.get('/', function (req, res) {
    res.json({
        message: 'AI Content SEO'
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, function () {
    console.log(`AI Content SEO Integration API listening on port ${PORT}!`);
});