CREATE OR REPLACE PROCEDURE load_orders (p_id IN orders.id%TYPE) IS
  -- SELECT * and = NULL inside comments are ignored
  v_note VARCHAR2(100) := 'WHEN OTHERS THEN NULL; SELECT * FROM x';
BEGIN
  UPDATE orders SET processed = NULL WHERE id = p_id AND status IS NULL;
  IF EXISTS_FLAG = 'Y' THEN
    NULL;
  END IF;
  EXECUTE IMMEDIATE 'DELETE FROM orders WHERE id = :id' USING p_id;
  COMMIT;
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    NULL;
  WHEN OTHERS THEN
    log_error(SQLERRM);
    RAISE;
END load_orders;
/
