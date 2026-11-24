CREATE OR REPLACE PACKAGE BODY app.pkg_orders AS
  -- plsql-lint parity corpus: realistic package body
  c_max CONSTANT PLS_INTEGER := 100;

  PROCEDURE log_error(p_msg IN VARCHAR) IS
    PRAGMA AUTONOMOUS_TRANSACTION;
  BEGIN
    INSERT INTO app_log (ts, msg) VALUES (SYSTIMESTAMP, p_msg);
  END log_error;

  PROCEDURE log_ok(p_msg IN VARCHAR2) IS
    PRAGMA AUTONOMOUS_TRANSACTION;
  BEGIN
    INSERT INTO app_log (ts, msg) VALUES (SYSTIMESTAMP, p_msg);
    COMMIT;
  END log_ok;

  FUNCTION has_orders(p_cust IN NUMBER) RETURN BOOLEAN IS
    l_cnt NUMBER;
  BEGIN
    SELECT COUNT(*) INTO l_cnt FROM orders WHERE customer_id = p_cust;
    RETURN l_cnt > 0;
  END has_orders;

  PROCEDURE close_old IS
  BEGIN
    FOR r IN (SELECT id FROM orders WHERE status = 'OPEN' AND created < SYSDATE - 30) LOOP
      UPDATE orders SET status = 'CLOSED', closed_by = NULL WHERE id = r.id;
      COMMIT;
    END LOOP;
    FOR i IN 1 .. c_max LOOP
      DELETE FROM tmp_ids WHERE id = i;
    END LOOP;
  EXCEPTION
    WHEN OTHERS THEN
      log_error(SQLERRM);
  END close_old;

  PROCEDURE purge IS
  BEGIN
    DELETE FROM tmp_ids;
    UPDATE orders o SET o.flag = 'N';
    MERGE INTO t USING s ON (t.id = s.id) WHEN MATCHED THEN UPDATE SET t.v = s.v;
    IF l_x = NULL OR l_y <> '' THEN
      dbms_output.put_line('x');
    END IF;
    EXECUTE IMMEDIATE 'DELETE FROM ' || p_tab || ' WHERE id = :1' USING p_id;
    SELECT * INTO l_row FROM orders WHERE ROWNUM = 1 ORDER BY created;
    l_d := TO_DATE(p_txt);
    RAISE_APPLICATION_ERROR(-30001, 'bad');
  EXCEPTION
    WHEN NO_DATA_FOUND THEN NULL;
    WHEN OTHERS THEN NULL;
  END;
END;
/
CREATE USER demo IDENTIFIED BY "Secret123";
CREATE DATABASE LINK remote CONNECT TO scott IDENTIFIED BY tiger USING 'orcl';
CREATE OR REPLACE TRIGGER trg_orders BEFORE INSERT OR UPDATE OF status OR DELETE ON orders FOR EACH ROW
BEGIN
  IF :new.status NOT IN (SELECT code FROM statuses) THEN NULL; END IF;
END;
/
GRANT SELECT, UPDATE, DELETE ON orders TO app_user;
ALTER TABLE child ADD CONSTRAINT fk FOREIGN KEY (pid) REFERENCES parent (id) ON DELETE CASCADE;
SELECT id FROM orders FOR UPDATE;
