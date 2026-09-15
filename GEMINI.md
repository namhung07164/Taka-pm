# GEMINI INSTRUCTIONS - TAKASHIMAYA PROJECT MANAGEMENT

⛔ **QUY TẮC BẤT KHẢ XÂM PHẠM**: Mọi logic, thiết kế và tính năng hiện tại của ứng dụng TUYỆT ĐỐI KHÔNG ĐƯỢC XÓA, LƯỢC BỎ HAY VÔ HIỆU HÓA trong quá trình viết code/upgrade. Chỉ được phép mở rộng hoặc tối ưu mã nguồn.
- **Persistent Architecture**: Tuân thủ tuyệt đối các quy tắc kiến trúc, toàn vẹn dữ liệu, và ngăn chặn lỗi trong `AGENTS.md`.

## GEMINI CORE BEHAVIOR - JSON MODE
1. **Strict JSON Syntax:** 
   - Chỉ dùng dấu ngoặc kép (`"`) cho key và string. Tuyệt đối không dùng nháy đơn (`'`).
   - Không để lại dấu phẩy thừa (trailing comma).
   - Giá trị rỗng trả về `null` (không dùng `"null"`).
2. **Output Format:**
   - Trả về JSON thuần túy (Raw JSON), KHÔNG bọc trong markdown (\`\`\`json).
   - KHÔNG thêm text giải thích trước hoặc sau JSON.
3. **Data Types:** Số là number, boolean là true/false (không viết hoa, không bọc nháy kép).
