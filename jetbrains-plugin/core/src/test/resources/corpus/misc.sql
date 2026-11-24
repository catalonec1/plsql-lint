declare
  v varchar(10);
  cursor c is select * from emp;
begin
  for rec in c loop
    insert into emp_hist values rec;
    goto done;
  end loop;
  for i in reverse 1..10 loop
    update t set x = i where id = i;
  end loop;
  <<done>>
  while v is null loop
    commit;
  end loop;
  open rc for 'select * from ' || v;
  select count(1) into n from dual where exists (select * from t);
  if n = 0 then null; end if;
exception when others then raise;
end;
/
