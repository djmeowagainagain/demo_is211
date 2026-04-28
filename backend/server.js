const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const DELAY_MS = Number(process.env.DEMO_DELAY_MS || "600");
const DEMO_ITEM_ID = 1;
const PHANTOM_THRESHOLD = 100;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

app.use(cors());
app.use(express.json());

const initDemoTables = async () => {
  await pool.query(
    "CREATE TABLE IF NOT EXISTS demo_items (id INT PRIMARY KEY, value INT NOT NULL)"
  );
  await pool.query(
    "CREATE TABLE IF NOT EXISTS demo_orders (id SERIAL PRIMARY KEY, amount INT NOT NULL)"
  );
  await pool.query(
    "INSERT INTO demo_items (id, value) VALUES ($1, 1000) ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value",
    [DEMO_ITEM_ID]
  );
};

initDemoTables().catch((err) => {
  console.error("Failed to initialize demo tables:", err);
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const safeRollback = async (client) => {
  try {
    await client.query("ROLLBACK");
  } catch (err) {
    return err;
  }
  return null;
};

const getDemoItemValue = async (client) => {
  const result = await client.query(
    "SELECT value FROM demo_items WHERE id = $1",
    [DEMO_ITEM_ID]
  );
  return result.rows[0] ? result.rows[0].value : null;
};

const resetDemoItemValue = async (value) => {
  await pool.query("UPDATE demo_items SET value = $1 WHERE id = $2", [
    value,
    DEMO_ITEM_ID,
  ]);
};

const seedDemoOrders = async () => {
  await pool.query("TRUNCATE demo_orders");
  await pool.query("INSERT INTO demo_orders (amount) VALUES (50), (75)");
};

const parseCount = (rows) => {
  if (!rows || rows.length === 0) {
    return 0;
  }
  return Number(rows[0].count);
};

const parseAmount = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return null;
  }
  return Math.trunc(num);
};

const getBalances = (rows) => {
  const [first, second] = rows;
  return {
    balance1: first ? first.balance : null,
    balance2: second ? second.balance : null,
  };
};

app.get("/balance", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, balance FROM accounts ORDER BY id ASC"
    );
    res.json(getBalances(result.rows));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/reset-demo", async (req, res) => {
  try {
    await pool.query(
      "INSERT INTO accounts (id, balance) VALUES (1, 1000) ON CONFLICT (id) DO UPDATE SET balance = EXCLUDED.balance"
    );
    await pool.query(
      "INSERT INTO accounts (id, balance) VALUES (2, 1000) ON CONFLICT (id) DO UPDATE SET balance = EXCLUDED.balance"
    );
    await pool.query(
      "INSERT INTO demo_items (id, value) VALUES ($1, 1000) ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value",
      [DEMO_ITEM_ID]
    );
    await pool.query("TRUNCATE demo_orders");

    const result = await pool.query(
      "SELECT id, balance FROM accounts ORDER BY id ASC"
    );
    res.json({ ok: true, ...getBalances(result.rows) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/withdraw-no-lock", async (req, res) => {
  const amount = parseAmount(req.body.amount);
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: "amount must be a positive number" });
  }

  const client = await pool.connect();
  try {
    const read = await client.query(
      "SELECT balance FROM accounts WHERE id = 1"
    );
    const balance = read.rows[0] ? read.rows[0].balance : 0;

    // Artificial delay to make the race condition visible.
    await sleep(DELAY_MS);

    const nextBalance = balance - amount;
    await client.query("UPDATE accounts SET balance = $1 WHERE id = 1", [
      nextBalance,
    ]);

    res.json({ before: balance, after: nextBalance, amount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.post("/withdraw-lock", async (req, res) => {
  const amount = parseAmount(req.body.amount);
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: "amount must be a positive number" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const read = await client.query(
      "SELECT balance FROM accounts WHERE id = 1 FOR UPDATE"
    );
    const balance = read.rows[0] ? read.rows[0].balance : 0;

    await sleep(DELAY_MS);

    const nextBalance = balance - amount;
    await client.query("UPDATE accounts SET balance = $1 WHERE id = 1", [
      nextBalance,
    ]);

    await client.query("COMMIT");
    res.json({ before: balance, after: nextBalance, amount });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      res.status(500).json({ error: rollbackErr.message });
      return;
    }
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.post("/dirty-read", async (req, res) => {
  const client1 = await pool.connect();
  const client2 = await pool.connect();
  try {
    await client1.query("BEGIN");
    const before = await getDemoItemValue(client1);

    await client1.query(
      "UPDATE demo_items SET value = value + 200 WHERE id = $1",
      [DEMO_ITEM_ID]
    );
    const uncommitted = await getDemoItemValue(client1);

    await sleep(DELAY_MS);

    await client2.query("BEGIN");
    await client2.query("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED");
    const observed = await getDemoItemValue(client2);
    await client2.query("COMMIT");

    await client1.query("ROLLBACK");

    const finalValue = await getDemoItemValue(client1);

    res.json({
      before,
      uncommitted,
      observed,
      final: finalValue,
      note: "PostgreSQL prevents dirty reads; observed should match before.",
    });
  } catch (err) {
    await safeRollback(client1);
    await safeRollback(client2);
    res.status(500).json({ error: err.message });
  } finally {
    client1.release();
    client2.release();
  }
});

app.post("/unrepeatable-read", async (req, res) => {
  const client1 = await pool.connect();
  const client2 = await pool.connect();
  let before = null;
  try {
    await client1.query("BEGIN");
    await client1.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
    before = await getDemoItemValue(client1);

    await client2.query("BEGIN");
    await client2.query(
      "UPDATE demo_items SET value = value + 50 WHERE id = $1",
      [DEMO_ITEM_ID]
    );
    await client2.query("COMMIT");

    const after = await getDemoItemValue(client1);
    await client1.query("COMMIT");

    await resetDemoItemValue(before);

    res.json({
      before,
      after,
      note: "READ COMMITTED allows non-repeatable reads.",
    });
  } catch (err) {
    await safeRollback(client1);
    await safeRollback(client2);
    if (before !== null) {
      await resetDemoItemValue(before);
    }
    res.status(500).json({ error: err.message });
  } finally {
    client1.release();
    client2.release();
  }
});

app.post("/unrepeatable-read-fix", async (req, res) => {
  const client1 = await pool.connect();
  const client2 = await pool.connect();
  let before = null;
  try {
    await client1.query("BEGIN");
    await client1.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    before = await getDemoItemValue(client1);

    await client2.query("BEGIN");
    await client2.query(
      "UPDATE demo_items SET value = value + 50 WHERE id = $1",
      [DEMO_ITEM_ID]
    );
    await client2.query("COMMIT");

    const after = await getDemoItemValue(client1);
    await client1.query("COMMIT");

    await resetDemoItemValue(before);

    res.json({
      before,
      after,
      note: "REPEATABLE READ keeps a stable snapshot.",
    });
  } catch (err) {
    await safeRollback(client1);
    await safeRollback(client2);
    if (before !== null) {
      await resetDemoItemValue(before);
    }
    res.status(500).json({ error: err.message });
  } finally {
    client1.release();
    client2.release();
  }
});

app.post("/phantom-read", async (req, res) => {
  const client1 = await pool.connect();
  const client2 = await pool.connect();
  try {
    await seedDemoOrders();

    await client1.query("BEGIN");
    await client1.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");

    const beforeResult = await client1.query(
      "SELECT COUNT(*)::int AS count FROM demo_orders WHERE amount >= $1",
      [PHANTOM_THRESHOLD]
    );

    await client2.query("BEGIN");
    await client2.query("INSERT INTO demo_orders (amount) VALUES ($1)", [
      PHANTOM_THRESHOLD + 50,
    ]);
    await client2.query("COMMIT");

    const afterResult = await client1.query(
      "SELECT COUNT(*)::int AS count FROM demo_orders WHERE amount >= $1",
      [PHANTOM_THRESHOLD]
    );

    await client1.query("COMMIT");
    await pool.query("TRUNCATE demo_orders");

    res.json({
      threshold: PHANTOM_THRESHOLD,
      before: parseCount(beforeResult.rows),
      after: parseCount(afterResult.rows),
      note: "READ COMMITTED allows phantom rows.",
    });
  } catch (err) {
    await safeRollback(client1);
    await safeRollback(client2);
    res.status(500).json({ error: err.message });
  } finally {
    client1.release();
    client2.release();
  }
});

app.post("/phantom-read-fix", async (req, res) => {
  const client1 = await pool.connect();
  const client2 = await pool.connect();
  try {
    await seedDemoOrders();

    await client1.query("BEGIN");
    await client1.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");

    const beforeResult = await client1.query(
      "SELECT COUNT(*)::int AS count FROM demo_orders WHERE amount >= $1",
      [PHANTOM_THRESHOLD]
    );

    await client2.query("BEGIN");
    await client2.query("INSERT INTO demo_orders (amount) VALUES ($1)", [
      PHANTOM_THRESHOLD + 50,
    ]);
    await client2.query("COMMIT");

    const afterResult = await client1.query(
      "SELECT COUNT(*)::int AS count FROM demo_orders WHERE amount >= $1",
      [PHANTOM_THRESHOLD]
    );

    await client1.query("COMMIT");
    await pool.query("TRUNCATE demo_orders");

    res.json({
      threshold: PHANTOM_THRESHOLD,
      before: parseCount(beforeResult.rows),
      after: parseCount(afterResult.rows),
      note: "REPEATABLE READ prevents phantom reads in PostgreSQL.",
    });
  } catch (err) {
    await safeRollback(client1);
    await safeRollback(client2);
    res.status(500).json({ error: err.message });
  } finally {
    client1.release();
    client2.release();
  }
});

const runTimestampDemo = () => {
  const logs = [];
  const item = { rts: 0, wts: 0, value: 100 };

  const read = (tx, ts) => {
    if (item.wts > ts) {
      logs.push(`${tx} READ abort (WTS=${item.wts} > TS=${ts})`);
      return false;
    }
    item.rts = Math.max(item.rts, ts);
    logs.push(`${tx} READ ok (RTS=${item.rts})`);
    return true;
  };

  const write = (tx, ts, delta) => {
    if (item.rts > ts || item.wts > ts) {
      logs.push(`${tx} WRITE abort (RTS=${item.rts}, WTS=${item.wts})`);
      return false;
    }
    item.wts = ts;
    item.value += delta;
    logs.push(`${tx} WRITE ok (WTS=${item.wts}, value=${item.value})`);
    return true;
  };

  const t1 = 10;
  const t2 = 20;

  logs.push(`Initial RTS=${item.rts}, WTS=${item.wts}, value=${item.value}`);
  read("T1", t1);
  write("T2", t2, 30);
  write("T1", t1, 5);
  logs.push(`Final RTS=${item.rts}, WTS=${item.wts}, value=${item.value}`);

  return logs;
};

app.post("/timestamp-demo", (req, res) => {
  res.json({ logs: runTimestampDemo() });
});

const runTransferOrdered = async (fromId, toId, amount) => {
  const client = await pool.connect();
  const lockOrder = [fromId, toId].sort((a, b) => a - b);
  try {
    await client.query("BEGIN");

    await client.query("SELECT id FROM accounts WHERE id = $1 FOR UPDATE", [
      lockOrder[0],
    ]);
    await sleep(DELAY_MS);
    await client.query("SELECT id FROM accounts WHERE id = $1 FOR UPDATE", [
      lockOrder[1],
    ]);

    const balances = await client.query(
      "SELECT id, balance FROM accounts WHERE id IN ($1, $2)",
      [fromId, toId]
    );
    const balanceMap = new Map(
      balances.rows.map((row) => [row.id, row.balance])
    );
    const fromBalance = balanceMap.get(fromId) ?? 0;
    const toBalance = balanceMap.get(toId) ?? 0;

    const fromNext = fromBalance - amount;
    const toNext = toBalance + amount;

    await client.query("UPDATE accounts SET balance = $1 WHERE id = $2", [
      fromNext,
      fromId,
    ]);
    await client.query("UPDATE accounts SET balance = $1 WHERE id = $2", [
      toNext,
      toId,
    ]);

    await client.query("COMMIT");

    return {
      fromId,
      toId,
      amount,
      fromBefore: fromBalance,
      toBefore: toBalance,
      lockOrder,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

const runTransfer = async (firstId, secondId, amount) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const first = await client.query(
      "SELECT balance FROM accounts WHERE id = $1 FOR UPDATE",
      [firstId]
    );

    await sleep(DELAY_MS);

    const second = await client.query(
      "SELECT balance FROM accounts WHERE id = $1 FOR UPDATE",
      [secondId]
    );

    const firstBalance = first.rows[0] ? first.rows[0].balance : 0;
    const secondBalance = second.rows[0] ? second.rows[0].balance : 0;

    const firstNext = firstBalance - amount;
    const secondNext = secondBalance + amount;

    await client.query("UPDATE accounts SET balance = $1 WHERE id = $2", [
      firstNext,
      firstId,
    ]);
    await client.query("UPDATE accounts SET balance = $1 WHERE id = $2", [
      secondNext,
      secondId,
    ]);

    await client.query("COMMIT");

    return {
      fromId: firstId,
      toId: secondId,
      amount,
      fromBefore: firstBalance,
      toBefore: secondBalance,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

app.post("/transfer-1", async (req, res) => {
  try {
    const result = await runTransfer(1, 2, 10);
    res.json({ ok: true, ...result });
  } catch (err) {
    if (err.code === "40P01") {
      res.status(409).json({ error: "deadlock detected" });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

app.post("/transfer-2", async (req, res) => {
  try {
    const result = await runTransfer(2, 1, 10);
    res.json({ ok: true, ...result });
  } catch (err) {
    if (err.code === "40P01") {
      res.status(409).json({ error: "deadlock detected" });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

app.post("/transfer-ordered", async (req, res) => {
  try {
    const result = await runTransferOrdered(1, 2, 10);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
