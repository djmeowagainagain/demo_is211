# Concurrency Control Demo

Demo web cho cac hien tuong dong thoi trong co so du lieu (lost update, row-level locking, deadlock) voi frontend React + Vite va backend Node.js + PostgreSQL.

## Muc tieu

- Mo phong lost update khi khong co lock.
- Sua bang transaction + row-level lock.
- Minh hoa deadlock khi khoa 2 dong theo thu tu nguoc nhau.
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
- Refresh Balance: tai lai so du
- Clear Logs: xoa log

## API

- GET /balance
- POST /withdraw-no-lock { amount }
- POST /withdraw-lock { amount }
- POST /transfer-1
- POST /transfer-2

## Reset data nhanh

```
sudo -u postgres psql concurrency_demo -f backend/db.sql
```