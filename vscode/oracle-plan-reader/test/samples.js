'use strict';
exports.TYPICAL = `Plan hash value: 3254851382

---------------------------------------------------------------------------------------------
| Id  | Operation                    | Name         | Rows  | Bytes |TempSpc| Cost (%CPU)| Time     |
---------------------------------------------------------------------------------------------
|   0 | SELECT STATEMENT             |              |  1500K|    80M|       | 21000   (2)| 00:00:01 |
|*  1 |  HASH JOIN                   |              |  1500K|    80M|    45M| 21000   (2)| 00:00:01 |
|   2 |   MERGE JOIN CARTESIAN       |              |    40 |   800 |       |     6   (0)| 00:00:01 |
|   3 |    TABLE ACCESS FULL         | DEPT         |     4 |    40 |       |     3   (0)| 00:00:01 |
|   4 |    BUFFER SORT               |              |    10 |   100 |       |     3   (0)| 00:00:01 |
|   5 |     TABLE ACCESS FULL        | REGIONS      |    10 |   100 |       |     1   (0)| 00:00:01 |
|*  6 |   TABLE ACCESS FULL          | ORDERS       |  1500K|    50M|       | 20000   (2)| 00:00:01 |
---------------------------------------------------------------------------------------------

Predicate Information (identified by operation id):
---------------------------------------------------

   1 - access("O"."DEPT_ID"="D"."DEPT_ID")
   6 - filter(TO_NUMBER("O"."CUST_CODE")=42 AND
              UPPER("O"."STATUS")='OPEN')

Note
-----
   - dynamic statistics used: dynamic sampling (level=2)
`;
exports.ALLSTATS = `SQL_ID  9babjv8yq8ru3, child number 0
-------------------------------------
Plan hash value: 1234

-------------------------------------------------------------------------------------------------
| Id  | Operation                     | Name    | Starts | E-Rows | A-Rows |   A-Time   | Buffers |
-------------------------------------------------------------------------------------------------
|   0 | SELECT STATEMENT              |         |      1 |        |  50000 |00:00:02.10 |   90000 |
|   1 |  NESTED LOOPS                 |         |      1 |     10 |  50000 |00:00:02.10 |   90000 |
|*  2 |   TABLE ACCESS FULL           | ORDERS  |      1 |     10 |  50000 |00:00:00.50 |    1000 |
|   3 |   TABLE ACCESS BY INDEX ROWID | CUST    |  50000 |      1 |  50000 |00:00:01.50 |   89000 |
|*  4 |    INDEX UNIQUE SCAN          | CUST_PK |  50000 |      1 |  50000 |00:00:00.80 |   50000 |
|   5 |  PARTITION RANGE ALL          |         |      1 |      1 |      1 |00:00:00.01 |       3 |
-------------------------------------------------------------------------------------------------

Predicate Information (identified by operation id):
---------------------------------------------------

   2 - filter("O"."NOTE" LIKE '%urgent%')
   4 - access("C"."ID"="O"."CUST_ID")
`;
