const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const DELAY_MS = Number(process.env.DEMO_DELAY_MS || "600");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

app.use(cors());
app.use(express.json());

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
