DROP TABLE IF EXISTS accounts;

CREATE TABLE accounts (
  id SERIAL PRIMARY KEY,
  balance INT NOT NULL
);

INSERT INTO accounts (balance) VALUES (1000);
INSERT INTO accounts (balance) VALUES (1000);
