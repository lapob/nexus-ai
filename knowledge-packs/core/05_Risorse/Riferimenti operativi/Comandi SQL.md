---
title: Comandi SQL
type: reference
area: resources
status: evergreen
level: foundation
visibility: public
created: 2026-07-23
updated: 2026-07-23
source_kind: curated
tags: [sql, database, commands]
aliases: [Database Commands]
---

# Comandi SQL

## Data definition

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users ADD COLUMN display_name TEXT;
CREATE INDEX idx_users_created_at ON users(created_at);
```

## CRUD

```sql
INSERT INTO users (email, display_name)
VALUES ('dev@example.test', 'Dev');

SELECT id, email
FROM users
WHERE created_at >= :from_date
ORDER BY created_at DESC
LIMIT 50;

UPDATE users
SET display_name = :display_name
WHERE id = :id;

DELETE FROM users
WHERE id = :id;
```

I placeholder dipendono dal driver. Non concatenare input in SQL.

## Join e aggregazione

```sql
SELECT u.email, COUNT(s.id) AS session_count
FROM users AS u
LEFT JOIN sessions AS s ON s.user_id = u.id
GROUP BY u.id, u.email
HAVING COUNT(s.id) > 0
ORDER BY session_count DESC;
```

## Transazione

```sql
BEGIN;
UPDATE accounts SET balance = balance - :amount WHERE id = :source_id;
UPDATE accounts SET balance = balance + :amount WHERE id = :destination_id;
COMMIT;
```

Su errore esegui `ROLLBACK`. Verifica isolation level, vincoli e concorrenza.

## Client

```bash
sqlite3 app.db
psql -d nome_database
mysql -u nome_utente -p nome_database
```

Non passare password nella command line: può finire nella history o nell'elenco processi.

## Analisi

```sql
EXPLAIN SELECT * FROM users WHERE email = :email;
EXPLAIN ANALYZE SELECT * FROM users WHERE email = :email;
```

`EXPLAIN ANALYZE` esegue la query: usalo con cautela su scritture o sistemi reali.

## Collegamenti

- [[03_Sviluppo/Linguaggi/SQL|Linguaggio SQL]]
- [[03_Sviluppo/Esempi di programmazione/SQL e automazione - esempi pratici|Esempi SQL]]
