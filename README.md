# AI Content Planning API

## 1. Tạo bảng `content_planning`

```sql
USE ai_content;

CREATE TABLE content_planning (
  id INT AUTO_INCREMENT PRIMARY KEY,
  brand_name VARCHAR(255) NOT NULL,
  main_keyword VARCHAR(255) NOT NULL,
  lsi_keywords TEXT,
  secondary_keywords TEXT,
  output_language VARCHAR(50),
  muc_dich_tim_kiem VARCHAR(255),
  status_writing VARCHAR(50),
  style_of_writing VARCHAR(100),
  tone_of_voice VARCHAR(100),
  search_intent VARCHAR(100),
  outline_result LONGTEXT,
  title_content VARCHAR(255),
  meta_description VARCHAR(300),
  link_outline VARCHAR(500),
  content LONGTEXT,
  link_wordpress VARCHAR(500),
  type VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


# Database
DB_NAME=ai_content
DB_USER=root
DB_PASSWORD=your_password
DB_HOST=127.0.0.1
DB_PORT=3306

# OpenAI API
OPENAI_API_KEY=your_openai_api_key

# Server
PORT=3000



# OpenAI API
OPENAI_API_KEY=your_openai_api_key

# Server
PORT=3000



Request 1: Tạo project
POST http://localhost:3000/api/ai-content/projects
Content-Type: application/json
{
  "brand_name": "Life Journal",
  "main_keyword": "cân bằng cuộc sống",
  "lsi_keywords": "cân bằng công việc và cuộc sống, quản lý thời gian, sức khỏe tinh thần",
  "secondary_keywords": "thói quen lành mạnh, sống chậm, giảm stress",
  "output_language": "Vietnamese"
}


Request 2: Phân tích Search Intent
http://localhost:3000/api/ai-content/projects/1/search-intent

Request 3: Xem kết quả
GET http://localhost:3000/api/ai-content/projects/1
```
