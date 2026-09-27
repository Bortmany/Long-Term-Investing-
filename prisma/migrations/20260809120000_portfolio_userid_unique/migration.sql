-- Data cleanup FIRST: merge duplicate Portfolio rows per user. A double-
-- submit / two-tab race in getOrCreatePortfolio (src/lib/user-portfolio.ts)
-- could create more than one portfolio for the same user before this
-- migration's unique constraint existed. Reads always picked the OLDEST
-- portfolio, so a second portfolio's transactions were silently invisible —
-- an understated (wrong) number, which the app's golden rule forbids.
--
-- Keep the oldest portfolio per user (the one reads already treat as "the"
-- portfolio), move every duplicate's transactions onto it, then remove the
-- now-empty duplicate(s). Without this step, the unique index below would
-- fail to create on any account that already hit the race.
WITH ranked AS (
    SELECT id, "userId",
           ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "createdAt" ASC, id ASC) AS rn
    FROM "Portfolio"
),
keepers AS (
    SELECT "userId", id AS keeper_id FROM ranked WHERE rn = 1
),
duplicates AS (
    SELECT r.id AS duplicate_id, k.keeper_id
    FROM ranked r
    JOIN keepers k ON k."userId" = r."userId"
    WHERE r.rn > 1
)
UPDATE "Transaction" t
SET "portfolioId" = d.keeper_id
FROM duplicates d
WHERE t."portfolioId" = d.duplicate_id;

WITH ranked AS (
    SELECT id, "userId",
           ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "createdAt" ASC, id ASC) AS rn
    FROM "Portfolio"
)
DELETE FROM "Portfolio" WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- DropIndex
DROP INDEX "Portfolio_userId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Portfolio_userId_key" ON "Portfolio"("userId");
