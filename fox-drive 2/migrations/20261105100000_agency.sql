-- Agence du chauffeur (colonne Agence de la feuille Google) : sert au filtre par agence
ALTER TABLE drivers ADD COLUMN agency TEXT NOT NULL DEFAULT '';
CREATE INDEX drivers_agency_idx ON drivers (agency);
