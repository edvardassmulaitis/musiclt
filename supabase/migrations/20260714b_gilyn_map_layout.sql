-- Gilyn v3 — užšaldytos žemėlapio koordinatės.
--
-- Force-directed layout paskaičiuotas VIENĄ kartą ant 3 607 kaimynysčių briaunų
-- ir įrašytas į DB. Skaičiuoti naršyklėje būtų klaida: žaidėjo pasaulis kaskart
-- atrodytų kitaip, ir jis niekada neįsimintų, kur kas guli.
alter table gilyn_terr add column if not exists map_x real;
alter table gilyn_terr add column if not exists map_y real;
