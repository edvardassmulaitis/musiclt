-- wiki_album_candidates: enrichment cache — kad nekartotume MB/Apple/Wiki fetch'ų
-- kiekvieną kartą užkraunant /admin/inbox/albums (žr. album-enrich.ts / preview route).
alter table wiki_album_candidates add column if not exists preview_payload jsonb;
alter table wiki_album_candidates add column if not exists preview_at timestamptz;
