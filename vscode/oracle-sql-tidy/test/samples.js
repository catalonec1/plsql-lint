'use strict';
// SQL and PL/SQL inputs that exercise everything the formatter must keep intact.
module.exports = {
  packageBody: `-- header comment
create or replace package body pkg_emp as
  /* block
     comment */
  procedure raise_sal(p_id in number, p_pct in number default 10) is
    v_name varchar2(100) := q'[it's]';
    cursor c is select e.id, e.name from emp e where e.dept_id = 10 and e.sal > 100;
  begin
    for r in c loop
      if r.id = p_id then update emp set sal = sal * (1 + p_pct/100), upd = sysdate where id = r.id; -- trailing
      elsif r.id < 0 then null;
      else dbms_output.put_line('x' || r.name);
      end if;
    end loop;
    select count(*) into v_cnt from emp e left join dept d on d.id = e.dept_id where d.name like 'A%' or d.name is null group by d.id order by 1;
    commit;
  exception
    when no_data_found then raise;
    when others then rollback; raise_application_error(-20001, 'err: ' || sqlerrm);
  end raise_sal;
end pkg_emp;
/
`,
  quotes: `select q'{a 'b' c}', q'<x>', nq'!multi
line!', 'it''s', N'unicode', "Mixed Case Col", 'a  --  not a comment', '/* not either */' from dual;
select 'line one
   line two with   spaces   ' as s from dual; /* trailing block */
`,
  sqlplus: `set serveroutput on
prompt Creating things
define tbl = emp
whenever sqlerror exit failure
@@other_script.sql
select * from &tbl where id = :id and x = &&y;
exec dbms_stats.gather_table_stats(user, 'EMP');
spool off
`,
  terminators: `create or replace trigger trg_emp before insert or update on emp for each row
declare
  v number;
begin
  :new.upd := sysdate; v := 10 / 2;
  if inserting then :new.id := emp_seq.nextval; end if;
end;
/
create or replace function f(p number) return number is begin return p / 2; end f;
/
select 1 / 2 from dual
/
`,
  sql: `with a as (select id, sum(x) total from t group by id having sum(x) > 0), b as (select * from u)
select a.id, b.name, case when a.total > 100 then 'big' when a.total > 10 then 'mid' else 'small' end as size_class,
row_number() over (partition by b.name order by a.total desc) rn
from a join b on b.id = a.id and b.flag = 'Y' left outer join c on c.id = a.id
where a.id between 1 and 1000 and exists (select 1 from v where v.id = a.id) or a.id in (1, 2, 3)
order by 1 desc nulls last fetch first 10 rows only;
merge into tgt t using (select id, val from src) s on (t.id = s.id)
when matched then update set t.val = s.val
when not matched then insert (id, val) values (s.id, s.val);
insert into t (a, b) select x, -1 from dual union all select y, +2 from dual;
delete from t where a = -1 returning a into :x;
`,
  plsql: `declare
  type t_ids is table of number index by pls_integer;
  l t_ids;
  c sys_refcursor;
begin
  <<outer>>
  for i in 1 .. 10 loop
    exit outer when i > 5;
    l(i) := i ** 2;
  end loop;
  while l.count > 0 loop l.delete(l.last); end loop;
  case l.count when 0 then null; when 1 then dbms_output.put_line('one'); else null; end case;
  forall i in 1 .. l.count insert into t values (l(i));
  open c for select * from t;
  execute immediate 'begin null; end;';
exception when others then
  if sqlcode = -1 then null; end if; raise;
end;
/
`,
};
