package com.serpupdate.provider.brightdata;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;

/**
 * Class này trích xuất nội dung AI Overview từ Google Search
 * QUAN TRỌNG: Không hardcode bất kỳ nội dung text nào từ kết quả
 */
public class AiOverviewExtractor {

  /**
   * Phương thức chính để trích xuất AI Overview
   * Giải thích các bước:
   *
   * BƯỚC 1: Parse HTML bằng JSoup
   * BƯỚC 2: Tìm kiếm element chứa AI Overview theo nhiều cách
   * BƯỚC 3: Trích xuất và làm sạch text
   * BƯỚC 4: Trả về kết quả
   */
  public static String extractAiOverviewText(String html) {
    try {
      // BƯỚC 1: Parse HTML thành DOM tree
      Document doc = Jsoup.parse(html);

      // BƯỚC 2: Áp dụng các chiến lược tìm kiếm

      // Chiến lược 1: Tìm theo vị trí trong trang (ƯU TIÊN NHẤT)
      // AI Overview đầu tiên thường xuất hiện đầu tiên trong #rso
      String result = findByPosition(doc);
      if (result != null) return result;

      // Chiến lược 2: Tìm div không có thuộc tính nhưng giàu nội dung
      // (Đặc biệt cho AI Overview kiểu mới)
      result = findByEmptyAttributesRichContent(doc);
      if (result != null) return result;

      // Chiến lược 3: Tìm theo cấu trúc DOM đặc trưng
      // AI Overview có cấu trúc div lồng nhau đặc biệt
      result = findByDomStructure(doc);
      if (result != null) return result;

      // Chiến lược 4: Tìm theo thuộc tính data-attrid
      // AI Overview thường có data-attrid chứa từ khóa đặc biệt
      result = findByDataAttrid(doc);
      if (result != null) return result;

      // Chiến lược 5: Tìm theo đặc điểm nội dung
      result = findByContentCharacteristics(doc);
      if (result != null) return result;
      // (Đặc biệt cho AI Overview kiểu mới)
      result = findByEmptyAttributesRichContent(doc);
      if (result != null) return result;

      return null;

    } catch (Exception e) {
      System.err.println("Lỗi khi trích xuất: " + e.getMessage());
      e.printStackTrace();
      return null;
    }
  }

  /**
   * CHIẾN LƯỢC 1: Tìm kiếm theo thuộc tính data-attrid
   * Giải thích: Google đánh dấu các section đặc biệt bằng data-attrid
   */
  private static String findByDataAttrid(Document doc) {
    // Tìm tất cả elements có data-attrid
    Elements elements = doc.select("[data-attrid]");

    for (Element element : elements) {
      String attrid = element.attr("data-attrid");

      // Kiểm tra xem attrid có chứa các từ khóa AI không
      // KHÔNG hardcode nội dung, chỉ kiểm tra tên thuộc tính
      if (containsAiKeywords(attrid)) {
        String text = extractCleanText(element);
        if (isValidAiOverview(text)) {
          return text;
        }
      }
    }
    return null;
  }

  /**
   * CHIẾN LƯỢC 2: Tìm kiếm theo cấu trúc DOM
   * Giải thích: AI Overview có cấu trúc div đặc trưng với nhiều div con
   */
  private static String findByDomStructure(Document doc) {
    // Chiến lược 2a: Tìm div cha có jsname chứa div con không có thuộc tính
    Elements parentsWithJsname = doc.select("div[jsname]");

    for (Element parent : parentsWithJsname) {
      // Lấy các div con trực tiếp
      Elements directChildren = parent.children().select("div");

      for (Element child : directChildren) {
        // Tìm div con không có thuộc tính (hoặc rất ít thuộc tính)
        if (child.attributes().size() == 0) {
          // Đếm số div và span bên trong
          int divCount = child.select("div").size();
          int spanCount = child.select("span").size();

          // AI Overview có nhiều div (>100) và span (>100)
          if (divCount > 100 && spanCount > 100) {
            String text = extractCleanText(child);
            if (isValidAiOverview(text)) {
              return text;
            }
          }
        }
      }
    }

    // Chiến lược 2b: Tìm div có jsname với class đặc trưng
    Elements candidates = doc.select("div[jsname][class]");

    for (Element candidate : candidates) {
      // Đếm số lượng div con và span con
      int divCount = candidate.select("div").size();
      int spanCount = candidate.select("span").size();

      // AI Overview thường có nhiều div và span lồng nhau
      if (divCount > 5 && spanCount > 3) {
        String text = extractCleanText(candidate);
        if (isValidAiOverview(text)) {
          return text;
        }
      }
    }

    return null;
  }

  /**
   * CHIẾN LƯỢC 3: Tìm kiếm theo vị trí
   * Giải thích: AI Overview thường là element đầu tiên trong #rso
   * LƯU Ý: Nếu có nhiều AI Overview, lấy cái xuất hiện ĐẦU TIÊN
   */
  private static String findByPosition(Document doc) {
    // Tìm container chính của kết quả tìm kiếm
    Element rso = doc.getElementById("rso");
    if (rso == null) return null;

    // Tìm TẤT CẢ các div có thể là AI Overview
    Elements allDivs = rso.select("div");

    // Danh sách lưu các candidate AI Overview
    java.util.List<CandidateAI> candidates = new java.util.ArrayList<>();

    for (Element div : allDivs) {
      String text = extractCleanText(div);

      // Kiểm tra xem có phải AI Overview không
      if (isValidAiOverview(text)) {
        // Tính vị trí của div trong HTML gốc
        int position = getElementPosition(div, rso);
        candidates.add(new CandidateAI(text, position, div));
      }
    }

    // Nếu có nhiều candidates, chọn cái xuất hiện đầu tiên
    if (!candidates.isEmpty()) {
      // Sắp xếp theo vị trí
      candidates.sort((a, b) -> Integer.compare(a.position, b.position));
      return candidates.get(0).text;
    }

    return null;
  }

  /**
   * Tính vị trí của element trong cây DOM (số thứ tự depth-first)
   */
  private static int getElementPosition(Element target, Element root) {
    Elements allElements = root.getAllElements();
    for (int i = 0; i < allElements.size(); i++) {
      if (allElements.get(i) == target) {
        return i;
      }
    }
    return Integer.MAX_VALUE;
  }

  /**
   * Class phụ để lưu thông tin AI Overview candidate
   */
  private static class CandidateAI {
    String text;
    int position;
    Element element;

    CandidateAI(String text, int position, Element element) {
      this.text = text;
      this.position = position;
      this.element = element;
    }
  }

  /**
   * CHIẾN LƯỢC 5: Tìm div không có thuộc tính nhưng có nhiều nội dung
   * Giải thích: Một số AI Overview mới không có thuộc tính data-*
   * nhưng có rất nhiều div và span con
   */
  private static String findByEmptyAttributesRichContent(Document doc) {
    // Tìm div cha có jsname
    Elements parentsWithJsname = doc.select("div[jsname]");

    for (Element parent : parentsWithJsname) {
      // Lấy tất cả div con
      Elements allChildDivs = parent.select("div");

      for (Element childDiv : allChildDivs) {
        // Kiểm tra div không có thuộc tính
        if (childDiv.attributes().size() == 0) {
          // Đếm số div và span bên trong
          int nestedDivs = childDiv.select("div").size();
          int nestedSpans = childDiv.select("span").size();

          // AI Overview mới có rất nhiều nested elements
          if (nestedDivs > 80 && nestedSpans > 80) {
            String text = extractCleanText(childDiv);

            // Kiểm tra độ dài phù hợp (1000-3000 ký tự)
            if (text.length() >= 1000 && text.length() <= 3000) {
              if (isValidAiOverview(text)) {
                return text;
              }
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * CHIẾN LƯỢC 4: Tìm kiếm theo đặc điểm nội dung
   * Giải thích: AI Overview có độ dài và cấu trúc đặc biệt
   */
  private static String findByContentCharacteristics(Document doc) {
    Elements allDivs = doc.select("div");

    for (Element div : allDivs) {
      String text = extractCleanText(div);

      // Kiểm tra nhiều tiêu chí
      if (text.length() > 300 && text.length() < 5000) {
        // Đếm số dấu chấm (câu)
        int sentences = text.split("\\.").length;
        // Đếm số dấu hai chấm (danh sách)
        int colons = text.split(":").length - 1;

        // AI Overview thường có nhiều câu và danh sách
        if (sentences > 5 && colons > 2) {
          // Kiểm tra không phải quảng cáo hoặc snippet thông thường
          if (!div.select("a[href]").isEmpty()) {
            continue; // Bỏ qua nếu có nhiều link
          }

          if (isValidAiOverview(text)) {
            return text;
          }
        }
      }
    }
    return null;
  }

  /**
   * Hàm phụ: Kiểm tra xem thuộc tính có chứa từ khóa AI không
   */
  private static boolean containsAiKeywords(String attrid) {
    if (attrid == null || attrid.isEmpty()) return false;

    String lower = attrid.toLowerCase();
    // Kiểm tra các từ khóa thường dùng trong tên thuộc tính
    return lower.contains("ai") ||
            lower.contains("overview") ||
            lower.contains("answer") ||
            lower.contains("summary") ||
            lower.contains("gemini");
  }

  /**
   * Hàm phụ: Trích xuất text sạch từ element
   * Giải thích: Loại bỏ whitespace thừa, giữ nguyên cấu trúc
   */
  private static String extractCleanText(Element element) {
    if (element == null) return "";

    // Lấy text và làm sạch
    String text = element.text();

    // Loại bỏ nhiều space liên tiếp
    text = text.replaceAll("\\s+", " ");

    // Trim đầu cuối
    text = text.trim();

    return text;
  }

  /**
   * Hàm phụ: Kiểm tra xem text có phải AI Overview hợp lệ không
   * Giải thích: Dựa vào độ dài, cấu trúc, không hardcode nội dung
   */
  private static boolean isValidAiOverview(String text) {
    if (text == null || text.isEmpty()) return false;

    // Loại trừ các div UI của Google (không phải nội dung AI Overview)
    if (text.startsWith("Tổng quan về AI") ||
            text.startsWith("Không có Thông tin tổng quan")) {
      return false;
    }

    // Kiểm tra độ dài tối thiểu (AI Overview thường dài hơn 1000 ký tự)
    // Nhưng cũng không quá dài (loại trừ toàn bộ trang)
    if (text.length() < 1000 || text.length() > 3000) return false;

    // Kiểm tra độ dài tối đa (tránh lấy nhầm toàn bộ trang)
    if (text.length() > 10000) return false;

    // Kiểm tra có cấu trúc câu không
    if (!text.contains(".") && !text.contains("。")) return false;

    // Kiểm tra không phải chỉ là số hoặc ký tự đặc biệt
    int letterCount = 0;
    for (char c : text.toCharArray()) {
      if (Character.isLetter(c)) letterCount++;
    }
    if (letterCount < text.length() * 0.5) return false;

    return true;
  }

  /**
   * Hàm main để test - đọc file HTML và trích xuất
   */
  public static void main(String[] args) {
    try {
      // Đọc file HTML
      String filePath = "C:\\Users\\lelua\\Downloads\\html.txt";
      String htmlContent = new String(Files.readAllBytes(Paths.get(filePath)), "UTF-8");

      // Trích xuất AI Overview
      String aiOverview = extractAiOverviewText(htmlContent);

      if (aiOverview != null) {
        System.out.println("=== AI OVERVIEW ĐÃ TRÍCH XUẤT ===");
        System.out.println(aiOverview);
        System.out.println("\n=== THÔNG TIN ===");
        System.out.println("Độ dài: " + aiOverview.length() + " ký tự");
        System.out.println("Số từ ước tính: " + aiOverview.split("\\s+").length + " từ");
      } else {
        System.out.println("Không tìm thấy AI Overview trong HTML");
      }

    } catch (IOException e) {
      System.err.println("Lỗi đọc file: " + e.getMessage());
    }
  }
}