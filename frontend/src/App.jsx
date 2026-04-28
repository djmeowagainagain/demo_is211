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
    "📌 Postgres mặc định từ chối Dirty Read, nên giá trị đọc được vẫn là bản cũ.",
  "READ COMMITTED allows non-repeatable reads.":
    "📌 Mức READ COMMITTED bị lỗi Unrepeatable read do dữ liệu bị cập nhật chèn.",
  "REPEATABLE READ keeps a stable snapshot.":
    "📌 Mức REPEATABLE READ đã tạo Snapshot cách ly nên đọc 2 lần kết quả y hệt nhau.",
  "READ COMMITTED allows phantom rows.": "📌 Đã xảy ra bóng ma (Phantom Read) ở mức READ COMMITTED.",
  "REPEATABLE READ prevents phantom reads in PostgreSQL.":
    "📌 Mức REPEATABLE READ trên Postgres mạnh hơn SQL Standard, nó block luôn cả lỗi Bóng ma.",
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
      addLog(`❌ Lỗi tải số dư: ${formatError(err)}`);
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
      addLog("⚠ Số tiền rút phải lớn hơn 0.");
      return;
    }

    setIsRunning(true);
    addLog("▶ Bắt đầu 2 giao dịch RÚT TIỀN KHÔNG KHÓA song song...");

    try {
      const [first, second] = await Promise.all([
        withdrawNoLock(value),
        withdrawNoLock(value),
      ]);
      addLog(`⚠ LỖI MẤT CẬP NHẬT: GD1 lưu số dư: ${first.data.after} $ | GD2 lưu số dư: ${second.data.after} $`);
    } catch (err) {
      addLog(`❌ Lỗi NO LOCK: ${formatError(err)}`);
    } finally {
      await loadBalance();
      addLog("✔ Hoàn tất. Hãy nhìn số dư tài khoản A để thấy tiền đã bị trừ sai.");
      setIsRunning(false);
    }
  };

  const runWithLock = async () => {
    const value = parseAmount();
    if (!value) {
      addLog("⚠ Số tiền rút phải lớn hơn 0.");
      return;
    }

    setIsRunning(true);
    addLog("▶ Bắt đầu 2 giao dịch RÚT CÓ KHÓA (FOR UPDATE) song song...");

    try {
      const [first, second] = await Promise.all([
        withdrawLock(value),
        withdrawLock(value),
      ]);
      addLog(`✔ THÀNH CÔNG: GD1 trừ còn ${first.data.after} $ | GD2 trừ tiếp còn ${second.data.after} $`);
    } catch (err) {
      addLog(`❌ Lỗi LOCK: ${formatError(err)}`);
    } finally {
      await loadBalance();
      addLog("✔ Hoàn tất. Số dư tài khoản A đã được trừ chuẩn xác đúng 2 lần.");
      setIsRunning(false);
    }
  };

  const runDeadlock = async () => {
    setIsRunning(true);
    addLog("▶ Bắt đầu tạo DEADLOCK (A chuyển B, B chuyển A đồng thời)...");

    const results = await Promise.allSettled([deadlock1(), deadlock2()]);
    results.forEach((result, index) => {
      let gd = index === 0 ? "A -> B" : "B -> A";
      if (result.status === "fulfilled") {
        addLog(`✔ Luồng ${gd}: Hoàn thành thành công.`);
      } else {
        addLog(`❌ Luồng ${gd} bị HỦY (Rollback): ${formatError(result.reason)}`);
      }
    });

    addLog("⚡ Hệ thống đã xảy ra bế tắc (Deadlock). HĐH bắt buộc phải kill 1 trong 2 tiến trình.");
    await loadBalance();
    setIsRunning(false);
  };

  const runOrderedTransfer = async () => {
    setIsRunning(true);
    addLog("▶ Bắt đầu khóa 2 Phase (2 Phase Locking) có sắp xếp thứ tự ID...");

    try {
      const res = await transferOrdered();
      const order = res.data.lockOrder ? res.data.lockOrder.join(" -> ") : "";
      addLog(`✔ Chuyển tiền an toàn. Đã khóa các hàng theo đúng ID thứ tự (${order}), chặn được vòng tròn Deadlock.`);
    } catch (err) {
      addLog(`❌ Lỗi ORDERED LOCK: ${formatError(err)}`);
    } finally {
      await loadBalance();
      setIsRunning(false);
    }
  };

  const runDirtyRead = async () => {
    setIsRunning(true);
    addLog("▶ Bắt đầu mô phỏng: ĐỌC DỮ LIỆU RÁC (DIRTY READ)...");

    try {
      const res = await dirtyRead();
      addLog(`🔍 Giá trị cũ: ${res.data.before}. Đang bị sửa (chưa COMMIT): ${res.data.uncommitted}`);
      addLog(`🔍 Quan sát từ 1 luồng khác: Thấy giá trị là ${res.data.observed}`);
      if (res.data.note) {
        addLog(formatNote(res.data.note));
      }
    } catch (err) {
      addLog(`❌ Lỗi DIRTY READ: ${formatError(err)}`);
    } finally {
      setIsRunning(false);
    }
  };

  const runUnrepeatableRead = async () => {
    setIsRunning(true);
    addLog("▶ Bắt đầu mô phỏng: ĐỌC KHÔNG LẶP LẠI (UNREPEATABLE READ)...");

    try {
      const res = await unrepeatableRead();
      addLog(`🔍 Lần 1 đọc: ${res.data.before}, Lần 2 đọc: ${res.data.after}`);
      if (res.data.note) {
        addLog(formatNote(res.data.note));
      }
    } catch (err) {
      addLog(`❌ Lỗi UNREPEATABLE READ: ${formatError(err)}`);
    } finally {
      setIsRunning(false);
    }
  };

  const runRepeatableRead = async () => {
    setIsRunning(true);
    addLog("▶ Thử lại với mức phân lập: REPEATABLE READ...");

    try {
      const res = await unrepeatableReadFix();
      addLog(`🔍 Lần 1 đọc: ${res.data.before}, Lần 2 đọc: ${res.data.after} (Giá trị được giữ tuyệt đối)`);
      if (res.data.note) {
        addLog(formatNote(res.data.note));
      }
    } catch (err) {
      addLog(`❌ Lỗi REPEATABLE READ: ${formatError(err)}`);
    } finally {
      setIsRunning(false);
    }
  };

  const runPhantomRead = async () => {
    setIsRunning(true);
    addLog("▶ Bắt đầu mô phỏng: ĐỌC BÓNG MA (PHANTOM READ)...");

    try {
      const res = await phantomRead();
      addLog(`🔍 Lần 1 đếm: ${res.data.before} dòng. Lần 2 đếm: ${res.data.after} dòng.`);
      if (res.data.note) {
        addLog(formatNote(res.data.note));
      }
    } catch (err) {
      addLog(`❌ Lỗi PHANTOM READ: ${formatError(err)}`);
    } finally {
      setIsRunning(false);
    }
  };

  const runPhantomReadFix = async () => {
    setIsRunning(true);
    addLog("▶ Thử chạy lại Đọc Bóng Ma trên mức REPEATABLE READ...");

    try {
      const res = await phantomReadFix();
      addLog(`🔍 Lần 1 đếm: ${res.data.before} dòng. Lần 2 đếm: ${res.data.after} dòng.`);
      if (res.data.note) {
        addLog(formatNote(res.data.note));
      }
    } catch (err) {
      addLog(`❌ Lỗi PHANTOM READ FIX: ${formatError(err)}`);
    } finally {
      setIsRunning(false);
    }
  };

  const runTimestampDemo = async () => {
    setIsRunning(true);
    addLog("▶ Báo cáo DEMO THUẬT TOÁN NHÃN THỜI GIAN (TIMESTAMP ORDERING)...");

    try {
      const res = await timestampDemo();
      if (Array.isArray(res.data.logs)) {
        res.data.logs.forEach((line) => addLog(`  ↳ ${line}`));
      }
      addLog("✔ Hoàn thành Timestamp Ordering");
    } catch (err) {
      addLog(`❌ Lỗi TIMESTAMP ORDERING: ${formatError(err)}`);
    } finally {
      setIsRunning(false);
    }
  };

  const runResetDemo = async () => {
    setIsRunning(true);
    addLog("▶ Đang xóa dọn và cấu hình lại Database...");

    try {
      const res = await resetDemo();
      if (res.data?.balance1 !== undefined && res.data?.balance2 !== undefined) {
        setBalance({ balance1: res.data.balance1, balance2: res.data.balance2 });
      } else {
        await loadBalance();
      }
      addLog("✔ Đã reset Data xong.");
    } catch (err) {
      addLog(`❌ Lỗi lúc dọn data: ${formatError(err)}`);
    } finally {
      setIsRunning(false);
    }
  };

  const boxStyle = { background: "#ffffff", border: "1px solid #e4e4e7", padding: "24px", borderRadius: "12px", marginBottom: "20px", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" };
  const headingStyle = { marginTop: 0, color: "#18181b", fontSize: "1.1rem", fontWeight: "600", letterSpacing: "-0.01em", marginBottom: "6px" };
  const textStyle = { fontSize: "0.9rem", color: "#71717a", marginBottom: "16px", lineHeight: "1.5" };
  
  const btnStyle = { padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontSize: "0.85rem", fontWeight: "500", border: "1px solid transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" };
  const btnPrimary = { ...btnStyle, background: "#18181b", color: "#ffffff" };
  const btnSecondary = { ...btnStyle, background: "#f4f4f5", color: "#18181b", border: "1px solid #e4e4e7" };
  const btnGhost = { ...btnStyle, background: "transparent", color: "#52525b", border: "1px solid #e4e4e7" };

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "40px 20px", fontFamily: "'Inter', system-ui, -apple-system, sans-serif", color: "#18181b", background: "#fafafa", minHeight: "100vh" }}>
      <header style={{ textAlign: "center", marginBottom: "40px" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: "700", letterSpacing: "-0.02em", color: "#09090b", marginBottom: "12px", marginTop: 0 }}>Quản Lý Giao Tác & Đồng Thời</h1>
        <p style={{ color: "#71717a", fontSize: "1.05rem", maxWidth: "600px", margin: "0 auto", lineHeight: "1.5" }}>
          Minh họa trực quan các khái niệm học thuật về cơ sở dữ liệu trên PostgreSQL.
        </p>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: "30px", alignItems: "start" }}>
        
        {/* Cột Trái: Điều Khiển */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          
          <div style={{ background: "#ffffff", border: "1px solid #e4e4e7", padding: "24px", borderRadius: "12px", marginBottom: "20px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ ...headingStyle, marginBottom: 0 }}>Tài khoản Demo</h3>
              <div style={{ display: "flex", gap: "8px" }}>
                <button style={btnGhost} onClick={loadBalance} disabled={isRunning}>Làm mới</button>
                <button style={btnSecondary} onClick={runResetDemo} disabled={isRunning}>Reset DB</button>
                <button style={btnGhost} onClick={() => setLogs([])} disabled={isRunning}>Xóa Log</button>
              </div>
            </div>
            <div style={{ display: "flex", gap: "16px" }}>
              <div style={{ background: "#f8fafc", borderRadius: "8px", padding: "20px", flex: 1, border: "1px solid #f1f5f9", textAlign: "center" }}>
                <span style={{ color: "#64748b", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: "600" }}>Thuê bao A</span><br />
                <strong style={{ fontSize: "1.75rem", color: "#0f172a", display: "block", marginTop: "8px", fontWeight: "700" }}>$ {balance.balance1}</strong>
              </div>
              <div style={{ background: "#f8fafc", borderRadius: "8px", padding: "20px", flex: 1, border: "1px solid #f1f5f9", textAlign: "center" }}>
                <span style={{ color: "#64748b", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: "600" }}>Thuê bao B</span><br />
                <strong style={{ fontSize: "1.75rem", color: "#0f172a", display: "block", marginTop: "8px", fontWeight: "700" }}>$ {balance.balance2}</strong>
              </div>
            </div>
          </div>

          <div style={boxStyle}>
            <h4 style={headingStyle}>1. Lost Update (Mất cập nhật)</h4>
            <p style={textStyle}>Giả lập 2 giao tác cùng trừ tiền tại một thời điểm.</p>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
              <span style={{ fontSize: "0.85rem", color: "#52525b", fontWeight: "500" }}>Số tiền trừ:</span>
              <input style={{ width: "80px", padding: "6px 10px", borderRadius: "6px", border: "1px solid #d4d4d8", fontSize: "0.9rem", outline: "none" }} type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button style={{ ...btnSecondary, color: "#ef4444" }} onClick={runNoLock} disabled={isRunning}>Rút Cùng Lúc (Sẽ Lỗi)</button>
              <button style={btnPrimary} onClick={runWithLock} disabled={isRunning}>Rút Dùng Khóa (Fix)</button>
            </div>
          </div>

          <div style={boxStyle}>
            <h4 style={headingStyle}>2. Deadlock (Khóa cứng)</h4>
            <p style={textStyle}>A chuyển B, đồng thời B chuyển A dẫn đến chờ đợi tài nguyên chéo.</p>
            <div style={{ display: "flex", gap: "10px" }}>
              <button style={{ ...btnSecondary, color: "#ef4444" }} onClick={runDeadlock} disabled={isRunning}>Tạo Bế Tắc</button>
              <button style={btnPrimary} onClick={runOrderedTransfer} disabled={isRunning}>Sắp Xếp Khóa (2PL)</button>
            </div>
          </div>

          <div style={boxStyle}>
            <h4 style={headingStyle}>3. Các Mức Lập Lịch (Isolation Levels)</h4>
            
            <div style={{ paddingBottom: "12px", marginBottom: "12px", borderBottom: "1px solid #f4f4f5" }}>
              <p style={{ ...textStyle, marginBottom: "8px", fontWeight: "500", color: "#27272a" }}>● Dirty Read (Đọc rác):</p>
              <button style={btnSecondary} onClick={runDirtyRead} disabled={isRunning}>Thử Đọc Rác</button>
            </div>
            
            <div style={{ paddingBottom: "12px", marginBottom: "12px", borderBottom: "1px solid #f4f4f5" }}>
              <p style={{ ...textStyle, marginBottom: "8px", fontWeight: "500", color: "#27272a" }}>● Unrepeatable Read (Đọc không bền):</p>
              <div style={{ display: "flex", gap: "10px" }}>
                <button style={btnSecondary} onClick={runUnrepeatableRead} disabled={isRunning}>Thử Gây Lỗi</button>
                <button style={btnPrimary} onClick={runRepeatableRead} disabled={isRunning}>Fix Bằng Repeatable Read</button>
              </div>
            </div>
            
            <div>
              <p style={{ ...textStyle, marginBottom: "8px", fontWeight: "500", color: "#27272a" }}>● Phantom Read (Đọc bóng ma):</p>
              <div style={{ display: "flex", gap: "10px" }}>
                <button style={btnSecondary} onClick={runPhantomRead} disabled={isRunning}>Thử Gây Lỗi</button>
                <button style={btnPrimary} onClick={runPhantomReadFix} disabled={isRunning}>Fix Bằng Repeatable Read</button>
              </div>
            </div>
          </div>

          <div style={boxStyle}>
            <h4 style={headingStyle}>4. Timestamp Ordering</h4>
            <p style={textStyle}>Khảo sát cơ chế gán nhãn thời gian chấp thuận/hủy bỏ giao tác (RTS, WTS).</p>
            <button style={btnPrimary} onClick={runTimestampDemo} disabled={isRunning}>Lập Lịch Timestamp Demo</button>
          </div>

        </div>

        {/* Cột Phải: Logs Terminal */}
        <div style={{ position: "sticky", top: "40px", display: "flex", flexDirection: "column", height: "calc(100vh - 80px)", minHeight: "500px" }}>
          <div style={{ background: "#18181b", padding: "12px 16px", borderTopLeftRadius: "12px", borderTopRightRadius: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#ff5f56" }}></div>
            <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#ffbd2e" }}></div>
            <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#27c93f" }}></div>
            <span style={{ color: "#a1a1aa", fontSize: "0.8rem", marginLeft: "12px", fontFamily: "monospace", fontWeight: "500" }}>postgres-server-log.sh</span>
          </div>
          <div style={{ background: "#09090b", color: "#e4e4e7", padding: "20px", borderBottomLeftRadius: "12px", borderBottomRightRadius: "12px", flexGrow: 1, overflowY: "auto", fontFamily: "'JetBrains Mono', Consolas, monospace", fontSize: "0.85rem", lineHeight: "1.6", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)" }}>
            {logs.length === 0 ? (
              <p style={{ color: "#52525b", fontStyle: "italic", margin: 0 }}>$ Chờ lệnh thực thi... Nhấn các chức năng bên trái để xem tiến trình.</p>
            ) : (
              logs.map((log, index) => <div key={index} style={{ marginBottom: "8px", wordBreak: "break-word" }}>{log}</div>)
            )}
          </div>
        </div>

      </section>
    </div>
  );
}
