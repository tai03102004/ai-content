require('dotenv').config();
var express = require('express');
var app = express();
var sequelize = require('./dbs/database');

// Middleware
app.use(express.json());
app.use(express.urlencoded({
    extended: true
}));

sequelize;

// Routes
app.use('/api/outlines', require('./routes/outline.routes'));
app.use('/api/contents', require('./routes/content.routes'));

app.get('/', function (req, res) {
    res.json({
        message: 'AI Content SEO'
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, function () {
    console.log(`AI Content SEO Integration API listening on port ${PORT}!`);
});