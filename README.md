# Demo Quản Lý Điều Khiển Đồng Thời (Concurrency Control Demo)

Đây là ứng dụng web minh hoạ trực quan các hiện tượng xảy ra khi nhiều giao tác cùng lúc truy xuất cơ sở dữ liệu (Concurrency Anomalies) và các cơ chế xử lý đồng thời. Chạy trên frontend React + Vite và backend Node.js + PostgreSQL.

## Mục tiêu

- Mô phỏng vấn đề mất cập nhật (Lost Update) khi không sử dụng khóa (Lock).
- Cách sửa lỗi bằng Giao tác (Transaction) và khóa cấp dòng (Row-level lock).
- Minh họa khóa chết (Deadlock) khi hai giao tác khóa bảng theo thứ tự chéo nhau.
- Minh họa các mức độ cô lập (Isolation Levels) và cách khắc phục:
  - Đọc rác (Dirty Read)
  - Đọc không lặp lại (Unrepeatable Read)
  - Đọc bóng ma (Phantom Read)
- Minh họa thuật toán Nhãn thời gian (Timestamp Ordering) và khóa theo thứ tự ID để tránh Deadlock.
- Log rõ ràng, trực quan để quan sát kết quả tại Frontend ảo.

## Cấu trúc thư mục

- `backend/`  - API viết bằng Express + truy vấn PostgreSQL
- `frontend/` - UI viết bằng React + Vite
- `implement.md` - Mô tả các yêu cầu ban đầu cho dự án

## Chuẩn bị môi trường

- Node.js 18+ / npm
- PostgreSQL 14+

## ⚙️ Cài đặt Cơ sở dữ liệu (PostgreSQL)

### Dành cho Windows:
Bên cạnh pgAdmin, bạn có thể thiết lập nhanh qua cửa sổ lệnh (Command Prompt / PowerShell) nếu đã cài PostgreSQL.
1) Mở Command Prompt và truy cập công cụ `psql` (Sửa đường dẫn 14/15/16 cho phù hợp với phiên bản của bạn):
```cmd
"C:\Program Files\PostgreSQL\14\bin\psql.exe" -U postgres
```
*(Hệ thống sẽ yêu cầu mật khẩu của user postgres)*

2) Trong màn hình `psql`, chạy lệnh tạo database:
```sql
CREATE DATABASE concurrency_demo;
```
Gõ `\q` để thoát.

3) Nạp bảng và dữ liệu mẫu bằng script `db.sql`:
```cmd
"C:\Program Files\PostgreSQL\14\bin\psql.exe" -U postgres -d concurrency_demo -f backend/db.sql
```

### Dành cho macOS / Linux (Ubuntu):
1) Tạo database nhanh bằng terminal:
```bash
createdb concurrency_demo
```
2) Nạp dữ liệu mẫu:
```bash
psql concurrency_demo -f backend/db.sql
```
*(Nếu bị lỗi phân quyền, hãy chạy bằng user postgres: `sudo -u postgres psql concurrency_demo -f backend/db.sql`)*

## ⚙️ Cấu hình Backend

Tao file `backend/.env` (bạn có thể copy từ đoạn mã dưới đây) và sửa `DATABASE_URL` cho khớp với tài khoản Postgres của bạn.

Ví dụ:
```env
DATABASE_URL=postgres://postgres:your_password@localhost:5432/concurrency_demo
PORT=3000
DEMO_DELAY_MS=600
```
**Lưu ý:** Nếu mật khẩu của bạn có ký tự đặc biệt (ví dụ @) thì cần thiết phải URL-encode:
- `@` -> `%40`
- `:` -> `%3A`
- `/` -> `%2F`

## 🚀 Chạy ứng dụng

**1. Chạy Backend:**
Mở terminal tại thư mục gốc:
```bash
cd backend
npm install
npm run dev
```
API mặc định sẽ chạy ở `http://localhost:3000`

**2. Chạy Frontend:**
Mở một tab terminal thứ 2:
```bash
cd frontend
npm install
npm run dev
```
Mở giao diện UI tại trang `http://localhost:5173`

## 📖 Các chức năng Demo

- **Run No Lock**: Mô phỏng Mất cập nhật - Tiền bị trừ sai do 2 luồng đè nhau.
- **Run With Lock**: Rút có Khóa - Trừ tiền chuẩn xác dựa vào khoá cấp độ dòng (`FOR UPDATE`).
- **Run Deadlock**: A chuyển B và B chuyển A cùng lúc tạo bế tắc vòng tròn. Sẽ có 1 request bị văng lỗi bảo vệ `deadlock detected`.
- **Dirty Read (Attempt)**: Cố gắng đọc dữ liệu rác chưa commit. Postgres sẽ tự động chặn việc này.
- **Unrepeatable Read**: Đọc 2 lần ra 2 giá trị khác nhau. 
- **Repeatable Read (Sửa lỗi)**: Cố định snapshot. Đọc 2 lần liên tiếp sẽ ra y hệt nhau.
- **Phantom Read / Phantom Read Fix**: Hiện tượng chèn thêm hàng (INSERT) khiến lệnh COUNT/SUM bị thay đổi số lượng.
- **Ordered Lock Transfer (2PL)**: Sắp xếp các hàng (`ID`) trước khi xin khoá để chạy an toàn, tránh 100% Deadlock.
- **Timestamp Ordering Demo**: Minh họa hệ thống Timestamp tự chối bỏ giao tác tới sau thông qua `RTS` (Read Timestamp) và `WTS` (Write Timestamp).
- Các nút hỗ trợ Refresh số dư, Reset Database gốc, và Xóa Logs.

## 🌐 Các API Endpoints
- `GET /balance`
- `POST /withdraw-no-lock` { amount }
- `POST /withdraw-lock` { amount }
- `POST /transfer-1`, `POST /transfer-2`
- `POST /transfer-ordered`
- `POST /dirty-read`
- `POST /unrepeatable-read`, `POST /unrepeatable-read-fix`
- `POST /phantom-read`, `POST /phantom-read-fix`
- `POST /timestamp-demo`
- `POST /reset-demo`

## 🧹 Reset Data Nhanh bằng Cửa sổ Lệnh
- **Windows**: `"C:\Program Files\PostgreSQL\14\bin\psql.exe" -U postgres -d concurrency_demo -f backend/db.sql`
- **Linux/Mac**: `sudo -u postgres psql concurrency_demo -f backend/db.sql`