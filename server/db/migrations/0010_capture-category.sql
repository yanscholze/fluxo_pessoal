-- Categoria adivinhada na captura.
--
-- A sugestão passa a chegar com um palpite de categoria, derivado do nome do
-- estabelecimento (ver core/domain/capture/categorize.ts). Fica numa coluna
-- própria, e não em `category_id`, porque as duas coisas são diferentes: uma é
-- o que a regra do app determinou, outra é o que a heurística achou. Guardar
-- as duas no mesmo lugar apagaria a distinção entre decisão e palpite.
ALTER TABLE capture_events ADD COLUMN suggested_category_id TEXT REFERENCES categories(id) ON DELETE SET NULL;
--> statement-breakpoint
-- Confiança do palpite, em milésimos, separada da confiança da leitura em si:
-- um valor lido com certeza pode ter categoria incerta, e vice-versa.
ALTER TABLE capture_events ADD COLUMN category_confidence_milli INTEGER NOT NULL DEFAULT 0;
