with open('USER_MANUAL.md', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "Single-Floor Partition Isolation" in line:
        lines[i] = (
            "       + **Chống rò rỉ dữ liệu và chống trùng loạn giữa các tầng (Floor Boundary Matching & Geometry Deduplication)**: "
            "Trong tab Live Layout Viewer, hệ thống cách ly tuyệt đối gian hàng theo từng tầng (`Store_Floor`) bằng chuẩn khớp từ vựng chính xác (Regex Word Boundary), "
            "loại bỏ 100% việc trộn lẫn bản vẽ/unit của các tầng khác (như B11, B12 vào B1; hay L10, L11 vào L1), đồng thời tự động băm toạ độ hình học đa giác & hình chữ nhật (Geometry Hashing) "
            "để khử trùng hoàn toàn nét vẽ đè chập, bóng mờ hoặc chữ chồng lấn khi người dùng sửa/tách gian hàng.\n"
            "       + **Đồng nhất 100% giữa Tab Liveview và Tab Review (Zero Discrepancy)**: Cả hai tab hiển thị đầy đủ 100% các ô gian hàng của tầng "
            "(loại bỏ cơ chế ẩn ngầm các gian hàng chưa có dự án), đồng thời cùng sử dụng chung Động cơ Quy tắc Động (`useDynamicUnitSummary`) và cơ chế phân giải ảnh nền Cloudflare R2 (`r2://`), "
            "bảo đảm màu sắc, phân nhóm và nhãn luôn khớp nhau 100%.\n"
        )
        break

with open('USER_MANUAL.md', 'w', encoding='utf-8') as f:
    f.writelines(lines)
print('UPDATED USER_MANUAL.md')
