// D1 limits LIKE/GLOB patterns to 50 bytes. Player addresses exceed that length,
// so character ownership must be checked with an exact prefix comparison.
export const playerScopeTriggers=[
 `CREATE TRIGGER IF NOT EXISTS pl_room_address_insert BEFORE INSERT ON pl WHEN NEW.pl_id NOT GLOB '/boards/*/players/*' BEGIN SELECT RAISE(ABORT,'Room player address required'); END`,
 `CREATE TRIGGER IF NOT EXISTS pl_room_address_update BEFORE UPDATE ON pl WHEN NEW.pl_id NOT GLOB '/boards/*/players/*' BEGIN SELECT RAISE(ABORT,'Room player address required'); END`,
 `CREATE TRIGGER IF NOT EXISTS character_room_address_insert BEFORE INSERT ON character WHEN /* scope_prefix_v2 */ substr(NEW.character_id,1,length(NEW.pl_id||'/characters/'))<>(NEW.pl_id||'/characters/') BEGIN SELECT RAISE(ABORT,'Room character address required'); END`,
 `CREATE TRIGGER IF NOT EXISTS character_room_address_update BEFORE UPDATE ON character WHEN /* scope_prefix_v2 */ substr(NEW.character_id,1,length(NEW.pl_id||'/characters/'))<>(NEW.pl_id||'/characters/') BEGIN SELECT RAISE(ABORT,'Room character address required'); END`,
 `CREATE TRIGGER IF NOT EXISTS room_owner_address_insert BEFORE INSERT ON room WHEN NEW.owner_pl_id NOT GLOB '/boards/*/players/*' BEGIN SELECT RAISE(ABORT,'Room owner address required'); END`
];
export async function ensurePlayerScope(db){
 const rows=(await db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND name IN ('character_room_address_insert','character_room_address_update')").all()).results||[];
 if(rows.length===2&&rows.every(row=>row.sql.includes('scope_prefix_v2')))return;
 // D1 batch is transactional: no request can observe a gap in protection.
 await db.batch([
  db.prepare('DROP TRIGGER IF EXISTS character_room_address_insert'),
  db.prepare('DROP TRIGGER IF EXISTS character_room_address_update'),
  ...playerScopeTriggers.map(sql=>db.prepare(sql))
 ]);
}
