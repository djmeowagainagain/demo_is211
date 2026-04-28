DROP TABLE IF EXISTS demo_orders;
DROP TABLE IF EXISTS demo_items;
DROP TABLE IF EXISTS accounts;

CREATE TABLE accounts (
  id SERIAL PRIMARY KEY,
  balance INT NOT NULL
);

INSERT INTO accounts (balance) VALUES (1000);
INSERT INTO accounts (balance) VALUES (1000);

CREATE TABLE demo_items (
  id INT PRIMARY KEY,
  value INT NOT NULL
);

CREATE TABLE demo_orders (
  id SERIAL PRIMARY KEY,
  amount INT NOT NULL
);

INSERT INTO demo_items (id, value) VALUES (1, 1000);
