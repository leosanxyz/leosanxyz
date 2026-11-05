-- Materials were free while Leo tried them out. A student who already wears one keeps it, as if won, at no cost.
INSERT OR IGNORE INTO cosmetics (source_key, user_id, item, created_at, cost)
SELECT json_array('cosmetic', user_id, 'material:' || json_extract(draft_json, '$.hologram.material')), user_id,
  'material:' || json_extract(draft_json, '$.hologram.material'), CAST(unixepoch('subsec') * 1000 AS INTEGER), 0
FROM student_passes
WHERE json_extract(draft_json, '$.hologram.material') IN ('fuego', 'slime', 'metal', 'fantasma', 'metal-color', 'fantasma-color', 'rayo', 'hielo');
