-- news.image_credit — hero nuotraukos kreditai {author, license, url}.
-- Nustatoma publikuojant naujieną (press foto autorius iš žiniasklaidos, wiki
-- autorius ir pan.). Turi pirmenybę prieš wikiImageCredit() URL paiešką viešame
-- straipsnyje, kad press nuotraukų autorius (kurio negalima atsekti iš URL po
-- kandidato ištrynimo) išliktų matomas.

alter table news add column if not exists image_credit jsonb;

comment on column news.image_credit is
  'Hero nuotraukos kreditai {author, license, url} — nustatoma publikuojant. Pirmenybė prieš wikiImageCredit().';
