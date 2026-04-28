# Concurrency Control Demo

Demo web cho cac hien tuong dong thoi trong co so du lieu (lost update, read anomalies, locking, deadlock, timestamp ordering) voi frontend React + Vite va backend Node.js + PostgreSQL.

## Muc tieu

- Mo phong lost update khi khong co lock.
- Sua bang transaction + row-level lock.
- Minh hoa deadlock khi khoa 2 dong theo thu tu nguoc nhau.
- Minh hoa dirty read (attempt), unrepeatable read, phantom read va cach khac phuc.
- Minh hoa timestamp ordering va khoa theo thu tu de tranh deadlock.
- Log ro rang de quan sat ket qua.

## Cau truc thu muc

- backend/  - API Express + PostgreSQL
- frontend/ - UI React + Vite
- implement.md - mo ta yeu cau ban dau

## Chuan bi

- Node.js 18+ / npm
- PostgreSQL 14+

## Cai dat CSDL

1) Tao database

```
createdb concurrency_demo
```

2) Tao bang va du lieu mau

```
psql concurrency_demo -f backend/db.sql
```

Neu bi loi quyen, chay bang user postgres:

```
sudo -u postgres psql concurrency_demo -f backend/db.sql
```

## Cau hinh backend

Tao file backend/.env tu backend/.env.example va sua DATABASE_URL.

Vi du:

```
DATABASE_URL=postgres://postgres:your_password@localhost:5432/concurrency_demo
PORT=3000
DEMO_DELAY_MS=600
```

Luu y: neu mat khau co ky tu dac biet (vi du @) thi can URL-encode:
- @ -> %40
- : -> %3A
- / -> %2F

## Chay backend

```
cd backend
npm install
npm run dev
```

API mac dinh o http://localhost:3000

## Chay frontend

```
cd frontend
npm install
npm run dev
```

Mo UI o http://localhost:5173

## Cac chuc nang demo

- Run No Lock: mo phong lost update (so du co the sai)
- Run With Lock: co lock (so du dung)
- Run Deadlock: 1 request bi fail (deadlock)
- Dirty Read (Attempt): thu doc du lieu chua commit (PostgreSQL se chan dirty read)
- Unrepeatable Read / Repeatable Read (Fix)
- Phantom Read / Phantom Read (Fix)
- Ordered Lock Transfer (2PL)
- Timestamp Ordering Demo
- Refresh Balance: tai lai so du
- Reset du lieu: dua du lieu ve trang thai mac dinh
- Clear Logs: xoa log

## Gia tri demo va ky vong

Gia tri mac dinh:
- Account A = 1000, Account B = 1000
- demo_items.value = 1000
- demo_orders rong (se duoc seed khi chay phantom)

Ky vong ket qua:
- Run No Lock: A chi giam 1 lan (mất update), log 2 response giong nhau.
- Run With Lock: A giam 2 lan, log 2 response khac nhau (vi du 900, 800).
- Run Deadlock: 1 request that bai voi "deadlock detected".
- Dirty Read (Attempt): observed bang before (PostgreSQL chan dirty read).
- Unrepeatable Read: before khac after (tang +50).
- Repeatable Read (Fix): before bang after.
- Phantom Read: count before < after (insert chen them hang).
- Phantom Read (Fix): count before bang after.
- Ordered Lock Transfer (2PL): thanh cong, lock order 1 -> 2.
- Timestamp Ordering Demo: log co buoc abort khi vi pham timestamp ordering.

## API

- GET /balance
- POST /withdraw-no-lock { amount }
- POST /withdraw-lock { amount }
- POST /transfer-1
- POST /transfer-2
- POST /transfer-ordered
- POST /dirty-read
- POST /unrepeatable-read
- POST /unrepeatable-read-fix
- POST /phantom-read
- POST /phantom-read-fix
- POST /timestamp-demo
- POST /reset-demo

## Reset data nhanh

```
sudo -u postgres psql concurrency_demo -f backend/db.sql
```