-- Read-only. Ted must run this against the target before applying the Tea migrations.
-- Results are counts only. No names, bodies, addresses, or author mappings leave SQL.
select
 (select count(*)::int from public.bookish_takes where not anonymous or signed_name is not null) signed_takes,
 (select count(*)::int from public.bookish_takes where spoiler_chapter>0) chapter_tagged_takes,
 (select count(*)::int from public.bookish_takes where length(body)>280) over_280_takes,
 (select count(*)::int from public.bookish_take_reactions) reactions;
