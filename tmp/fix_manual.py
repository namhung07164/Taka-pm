with open('USER_MANUAL.md', 'r') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'Phân trang Tin nhắn (Pagination / Limit to Last 25)' in line:
        lines[i] = '          - **Phân trang Tin nhắn (Pagination / Limit to Last 25)**: Mặc định chỉ hiển thị 25 tin nhắn trao đổi gần nhất để giao diện chat mở tức thì (0ms) và chống tràn bộ nhớ. Phía trên có nút `[ ⬆️ Xem thêm tin nhắn cũ hơn (+25) ]` để người dùng chủ động tải thêm khi cần xem lại lịch sử trao đổi. Khi nhấp từ thông báo (`focusCommentId`), hệ thống tự động mở rộng vùng hiển thị để cuộn chính xác đến tin nhắn cần xem.\n'
        break

with open('USER_MANUAL.md', 'w') as f:
    f.writelines(lines)

print('Updated line successfully!')
