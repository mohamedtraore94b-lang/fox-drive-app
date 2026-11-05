-- Compte rendu quotidien : une photo de la situation à 8 h chaque jour (qui a envoyé, qui reste à relancer)
CREATE TABLE daily_reports (
  day        DATE PRIMARY KEY,
  data       JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
