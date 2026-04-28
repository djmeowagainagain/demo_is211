import { useEffect, useState } from "react";
import {
  deadlock1,
  deadlock2,
  dirtyRead,
  getBalance,
  phantomRead,
  phantomReadFix,
  resetDemo,
  timestampDemo,
  transferOrdered,
  unrepeatableRead,
  unrepeatableReadFix,
  withdrawLock,
  withdrawNoLock,
} from "./api.js";
import "./styles.css";

const initialBalances = { balance1: "-", balance2: "-" };

const formatError = (err) => {
  if (err?.response?.data?.error) {
    return err.response.data.error;
  }
  if (err?.message) {
    return err.message;
  }
  return "Lỗi không xác định";
};

const noteTranslations = {
  "PostgreSQL prevents dirty reads; observed should match before.":
    "PostgreSQL chặn dirty read; giá trị quan sát sẽ giống với trước.",
  "READ COMMITTED allows non-repeatable reads.":
    "READ COMMITTED có thể gây unrepeatable read.",
  "REPEATABLE READ keeps a stable snapshot.":
    "REPEATABLE READ giữ snapshot ổn định.",
  "READ COMMITTED allows phantom rows.": "READ COMMITTED có thể gây phantom read.",
  "REPEATABLE READ prevents phantom reads in PostgreSQL.":
    "REPEATABLE READ chặn phantom read trên PostgreSQL.",
};

const formatNote = (note) => noteTranslations[note] || note;

export default function App() {
  const [balance, setBalance] = useState(initialBalances);
  const [logs, setLogs] = useState([]);
  const [amount, setAmount] = useState("100");
  const [isRunning, setIsRunning] = useState(false);

  const addLog = (msg) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const loadBalance = async () => {
    try {
      const res = await getBalance();
      setBalance(res.data);
    } catch (err) {
      addLog(`Lỗi tải số dư: ${formatError(err)}`);
    }
  };

  useEffect(() => {
    loadBalance();
  }, []);

  const parseAmount = () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }
    return Math.trunc(value);
  };

  const runNoLock = async () => {
    const value = parseAmount();
    if (!value) {
      addLog("Số tiền phải là số dương.");
      return;
    }

    setIsRunning(true);
    addLog("Đang chạy NO LOCK...");

    try {
      const [first, second] = await Promise.all([
        withdrawNoLock(value),
        withdrawNoLock(value),
      ]);
      addLog(`NO LOCK: kết quả ${first.data.after}, ${second.data.after}`);
    } catch (err) {
      addLog(`NO LOCK lỗi: ${formatError(err)}`);
    } finally {
      await loadBalance();
      addLog("Hoàn tất NO LOCK");
      setIsRunning(false);
    }
  };

  const runWithLock = async () => {
    const value = parseAmount();
    if (!value) {
      addLog("Số tiền phải là số dương.");
      return;
    }

    setIsRunning(true);
    addLog("Đang chạy LOCK...");

    try {
      const [first, second] = await Promise.all([
        withdrawLock(value),
        withdrawLock(value),
      ]);
      addLog(`LOCK: kết quả ${first.data.after}, ${second.data.after}`);
    } catch (err) {
      addLog(`LOCK lỗi: ${formatError(err)}`);
    } finally {
      await loadBalance();
      addLog("Hoàn tất LOCK");
      setIsRunning(false);
    }
  };

  const runDeadlock = async () => {
    setIsRunning(true);
    addLog("Đang chạy DEADLOCK...");

    const results = await Promise.allSettled([deadlock1(), deadlock2()]);
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        addLog(`Chuyển ${index + 1} thành công`);
      } else {
        addLog(`Chuyển ${index + 1} thất bại: ${formatError(result.reason)}`);
      }
    });

    addLog("Deadlock kết thúc (có thể có một request thất bại)");
    await loadBalance();
    setIsRunning(false);
  };

  const runOrderedTransfer = async () => {
    setIsRunning(true);
    addLog("Đang chạy ORDERED LOCK...");

    try {
      const res = await transferOrdered();
      const order = res.data.lockOrder ? res.data.lockOrder.join(" -> ") : "";
      addLog(`Chuyển khóa theo thứ tự thành công (thứ tự khóa ${order})`);
    } catch (err) {
      addLog(`ORDERED LOCK lỗi: ${formatError(err)}`);
    } finally {
      await loadBalance();
      setIsRunning(false);
    }
  };

  const runDirtyRead = async () => {
    setIsRunning(true);
    addLog("Đang thử DIRTY READ...");

    try {
      const res = await dirtyRead();
      addLog(
        `DIRTY READ: trước=${res.data.before}, chưa commit=${res.data.uncommitted}, quan sát=${res.data.observed}`
      );
      if (res.data.note) {
        addLog(`Ghi chú: ${formatNote(res.data.note)}`);
      }
    } catch (err) {
      addLog(`DIRTY READ lỗi: ${formatError(err)}`);
    } finally {
      setIsRunning(false);
    }
  };

  const runUnrepeatableRead = async () => {
    setIsRunning(true);
    addLog("Đang chạy UNREPEATABLE READ...");

    try {
      const res = await unrepeatableRead();
      addLog(`UNREPEATABLE READ: trước=${res.data.before}, sau=${res.data.after}`);
      if (res.data.note) {
        addLog(`Ghi chú: ${formatNote(res.data.note)}`);
      }
    } catch (err) {
      addLog(`UNREPEATABLE READ lỗi: ${formatError(err)}`);
    } finally {
      setIsRunning(false);
    }
  };

  const runRepeatableRead = async () => {
    setIsRunning(true);
    addLog("Đang chạy REPEATABLE READ...");

    try {
      const res = await unrepeatableReadFix();
      addLog(`REPEATABLE READ: trước=${res.data.before}, sau=${res.data.after}`);
      if (res.data.note) {
        addLog(`Ghi chú: ${formatNote(res.data.note)}`);
      }
    } catch (err) {
      addLog(`REPEATABLE READ lỗi: ${formatError(err)}`);
    } finally {
      setIsRunning(false);
    }
  };

  const runPhantomRead = async () => {
    setIsRunning(true);
    addLog("Đang chạy PHANTOM READ...");

    try {
      const res = await phantomRead();
      addLog(`PHANTOM READ: số lượng trước=${res.data.before}, sau=${res.data.after}`);
      if (res.data.note) {
        addLog(`Ghi chú: ${formatNote(res.data.note)}`);
      }
    } catch (err) {
      addLog(`PHANTOM READ lỗi: ${formatError(err)}`);
    } finally {
      setIsRunning(false);
    }
  };

  const runPhantomReadFix = async () => {
    setIsRunning(true);
    addLog("Đang chạy PHANTOM READ (khắc phục)...");

    try {
      const res = await phantomReadFix();
      addLog(
        `PHANTOM READ FIX: số lượng trước=${res.data.before}, sau=${res.data.after}`
      );
      if (res.data.note) {
        addLog(`Ghi chú: ${formatNote(res.data.note)}`);
      }
    } catch (err) {
      addLog(`PHANTOM READ FIX lỗi: ${formatError(err)}`);
    } finally {
      setIsRunning(false);
    }
  };

  const runTimestampDemo = async () => {
    setIsRunning(true);
    addLog("Đang chạy demo TIMESTAMP ORDERING...");

    try {
      const res = await timestampDemo();
      if (Array.isArray(res.data.logs)) {
        res.data.logs.forEach((line) => addLog(line));
      }
    } catch (err) {
      addLog(`TIMESTAMP ORDERING lỗi: ${formatError(err)}`);
    } finally {
      setIsRunning(false);
    }
  };

  const runResetDemo = async () => {
    setIsRunning(true);
    addLog("Đang reset dữ liệu demo...");

    try {
      const res = await resetDemo();
      if (res.data?.balance1 !== undefined && res.data?.balance2 !== undefined) {
        setBalance({ balance1: res.data.balance1, balance2: res.data.balance2 });
      } else {
        await loadBalance();
      }
      addLog("Reset dữ liệu hoàn tất");
    } catch (err) {
      addLog(`Reset dữ liệu lỗi: ${formatError(err)}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="page">
      <header className="hero">
        <h1>Demo Điều Khiển Đồng Thời</h1>
        <p>
          So sánh lost update, các hiện tượng đọc bất thường, cơ chế khóa và
          timestamp ordering trên PostgreSQL.
        </p>
      </header>

      <section className="panel">
        <div className="balance-grid">
          <div className="balance-card">
            <span>Tài khoản A</span>
            <strong>{balance.balance1}</strong>
          </div>
          <div className="balance-card">
            <span>Tài khoản B</span>
            <strong>{balance.balance2}</strong>
          </div>
        </div>

        <div className="controls">
          <label>
            Số tiền rút
            <input
              type="number"
              min="1"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>

          <div className="button-row">
            <button onClick={runNoLock} disabled={isRunning}>
              Chạy No Lock
            </button>
            <button onClick={runWithLock} disabled={isRunning}>
              Chạy With Lock
            </button>
            <button onClick={runDeadlock} disabled={isRunning}>
              Chạy Deadlock
            </button>
            <button className="ghost" onClick={loadBalance} disabled={isRunning}>
              Tải lại số dư
            </button>
            <button className="ghost" onClick={runResetDemo} disabled={isRunning}>
              Reset dữ liệu
            </button>
            <button className="ghost" onClick={() => setLogs([])} disabled={isRunning}>
              Xóa log
            </button>
          </div>

          <div className="section">
            <p className="section-title">Đọc bất thường</p>
            <div className="button-row">
              <button onClick={runDirtyRead} disabled={isRunning}>
                Dirty Read (thử)
              </button>
              <button onClick={runUnrepeatableRead} disabled={isRunning}>
                Unrepeatable Read
              </button>
              <button onClick={runRepeatableRead} disabled={isRunning}>
                Repeatable Read (khắc phục)
              </button>
              <button onClick={runPhantomRead} disabled={isRunning}>
                Phantom Read
              </button>
              <button onClick={runPhantomReadFix} disabled={isRunning}>
                Phantom Read (khắc phục)
              </button>
            </div>
          </div>

          <div className="section">
            <p className="section-title">Lập lịch & giao thức</p>
            <div className="button-row">
              <button onClick={runOrderedTransfer} disabled={isRunning}>
                Chuyển khóa theo thứ tự (2PL)
              </button>
              <button onClick={runTimestampDemo} disabled={isRunning}>
                Demo Timestamp Ordering
              </button>
            </div>
          </div>
        </div>

        <div className="logs">
          {logs.length === 0 ? (
            <p className="log-empty">Chưa có log. Chạy thử để xem kết quả.</p>
          ) : (
            logs.map((log, index) => <p key={index}>{log}</p>)
          )}
        </div>
      </section>
    </div>
  );
}
