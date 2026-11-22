-- فحص توافق القاعدة مع موازين — جدول تجربة zz_compat_docs يحذفه schema.sql بعدين، ما يلمس أي بيانات
-- انسخ كل المحتوى في تبويب SQL واضغط Go. النتيجة: صف واحد، كل الأعمدة لازم تكون 1

DROP TABLE IF EXISTS zz_compat_docs;
CREATE TABLE zz_compat_docs (
  collection  VARCHAR(64)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  parent_path VARCHAR(400) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
  id          VARCHAR(64)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  data        JSON NOT NULL,
  lawyer_id   VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin
              AS (CASE WHEN JSON_TYPE(JSON_EXTRACT(data, '$.lawyerId')) = 'STRING' THEN JSON_UNQUOTE(JSON_EXTRACT(data, '$.lawyerId')) END) STORED,
  case_id     VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin
              AS (CASE WHEN JSON_TYPE(JSON_EXTRACT(data, '$.caseId')) = 'STRING' THEN JSON_UNQUOTE(JSON_EXTRACT(data, '$.caseId')) END) STORED,
  client_id   VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin
              AS (CASE WHEN JSON_TYPE(JSON_EXTRACT(data, '$.clientId')) = 'STRING' THEN JSON_UNQUOTE(JSON_EXTRACT(data, '$.clientId')) END) STORED,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (collection, parent_path, id),
  KEY ix_docs_tenant (collection, lawyer_id, created_at),
  KEY ix_docs_case (collection, lawyer_id, case_id),
  KEY ix_docs_client (collection, lawyer_id, client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO zz_compat_docs (collection, parent_path, id, data) VALUES
 ('t', '', 'a', '{"lawyerId":"L1","n":9,"s":"ب","tags":["x","y"],"e":{},"ok":true,"caseId":null}'),
 ('t', '', 'b', '{"lawyerId":"L1","n":10,"s":"أ","tags":"x"}'),
 ('t', '', 'c', '{"lawyerId":"L2","n":"10"}'),
 ('h', 'cases/a_b', 'x', '{}'),
 ('h', 'cases/aXb', 'y', '{}');

SELECT
  VERSION() AS server_version,
  (SELECT GROUP_CONCAT(id ORDER BY id) FROM zz_compat_docs WHERE lawyer_id = 'L1') = 'a,b' AS generated_column,
  (SELECT case_id IS NULL FROM zz_compat_docs WHERE id = 'a') AS json_null,
  (SELECT GROUP_CONCAT(id) FROM zz_compat_docs WHERE JSON_TYPE(JSON_EXTRACT(data, '$."s"')) = 'STRING' AND JSON_UNQUOTE(JSON_EXTRACT(data, '$."s"')) = 'أ') = 'b' AS string_compare,
  (SELECT GROUP_CONCAT(id) FROM zz_compat_docs WHERE JSON_TYPE(JSON_EXTRACT(data, '$."n"')) IN ('INTEGER','DOUBLE','DECIMAL','UNSIGNED INTEGER') AND (JSON_UNQUOTE(JSON_EXTRACT(data, '$."n"')) + 0) >= 10) = 'b' AS number_compare,
  (SELECT GROUP_CONCAT(id) FROM zz_compat_docs WHERE JSON_TYPE(JSON_EXTRACT(data, '$."ok"')) = 'BOOLEAN' AND JSON_UNQUOTE(JSON_EXTRACT(data, '$."ok"')) = 'true') = 'a' AS boolean_compare,
  (SELECT GROUP_CONCAT(id) FROM zz_compat_docs WHERE JSON_TYPE(JSON_EXTRACT(data, '$."tags"')) = 'ARRAY' AND JSON_CONTAINS(JSON_EXTRACT(data, '$."tags"'), '"x"')) = 'a' AS array_contains,
  (SELECT GROUP_CONCAT(id ORDER BY CASE WHEN JSON_TYPE(JSON_EXTRACT(data, '$."n"')) IN ('INTEGER','DOUBLE','DECIMAL','UNSIGNED INTEGER') THEN JSON_UNQUOTE(JSON_EXTRACT(data, '$."n"')) + 0 END) FROM zz_compat_docs WHERE lawyer_id = 'L1') = 'a,b' AS numeric_order,
  (SELECT JSON_TYPE(JSON_EXTRACT(data, '$."e"')) = 'OBJECT' AND JSON_LENGTH(JSON_EXTRACT(data, '$."e"')) = 0 FROM zz_compat_docs WHERE id = 'a') AS empty_map,
  (SELECT GROUP_CONCAT(id) FROM zz_compat_docs WHERE parent_path LIKE 'cases/a\_b%') = 'x' AS like_escape;
