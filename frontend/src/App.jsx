import { useEffect, useState } from "react";
import {
  deadlock1,
  deadlock2,
  getBalance,
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
  return "unknown error";
};

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
      addLog(`Balance error: ${formatError(err)}`);
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
      addLog("Amount must be a positive number.");
      return;
    }

    setIsRunning(true);
    addLog("Running NO LOCK test...");

    try {
      const [first, second] = await Promise.all([
        withdrawNoLock(value),
        withdrawNoLock(value),
      ]);
      addLog(`NO LOCK responses: ${first.data.after}, ${second.data.after}`);
    } catch (err) {
      addLog(`NO LOCK error: ${formatError(err)}`);
    } finally {
      await loadBalance();
      addLog("Finished NO LOCK");
      setIsRunning(false);
    }
  };

  const runWithLock = async () => {
    const value = parseAmount();
    if (!value) {
      addLog("Amount must be a positive number.");
      return;
    }

    setIsRunning(true);
    addLog("Running LOCK test...");

    try {
      const [first, second] = await Promise.all([
        withdrawLock(value),
        withdrawLock(value),
      ]);
      addLog(`LOCK responses: ${first.data.after}, ${second.data.after}`);
    } catch (err) {
      addLog(`LOCK error: ${formatError(err)}`);
    } finally {
      await loadBalance();
      addLog("Finished LOCK");
      setIsRunning(false);
    }
  };

  const runDeadlock = async () => {
    setIsRunning(true);
    addLog("Running DEADLOCK...");

    const results = await Promise.allSettled([deadlock1(), deadlock2()]);
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        addLog(`Transfer ${index + 1} succeeded`);
      } else {
        addLog(`Transfer ${index + 1} failed: ${formatError(result.reason)}`);
      }
    });

    addLog("Deadlock finished (one may fail)");
    await loadBalance();
    setIsRunning(false);
  };

  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow">Distributed database lab</p>
        <h1>Concurrency Control Demo</h1>
        <p>
          Compare lost updates, row-level locking, and deadlock behavior using a
          shared PostgreSQL ledger.
        </p>
      </header>

      <section className="panel">
        <div className="balance-grid">
          <div className="balance-card">
            <span>Account A</span>
            <strong>{balance.balance1}</strong>
          </div>
          <div className="balance-card">
            <span>Account B</span>
            <strong>{balance.balance2}</strong>
          </div>
        </div>

        <div className="controls">
          <label>
            Withdraw amount
            <input
              type="number"
              min="1"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>

          <div className="button-row">
            <button onClick={runNoLock} disabled={isRunning}>
              Run No Lock
            </button>
            <button className="secondary" onClick={runWithLock} disabled={isRunning}>
              Run With Lock
            </button>
            <button className="secondary" onClick={runDeadlock} disabled={isRunning}>
              Run Deadlock
            </button>
            <button className="ghost" onClick={loadBalance} disabled={isRunning}>
              Refresh Balance
            </button>
            <button className="ghost" onClick={() => setLogs([])} disabled={isRunning}>
              Clear Logs
            </button>
          </div>
        </div>

        <div className="logs">
          {logs.length === 0 ? (
            <p className="log-empty">No logs yet. Run a test to see events.</p>
          ) : (
            logs.map((log, index) => <p key={index}>{log}</p>)
          )}
        </div>
      </section>
    </div>
  );
}
