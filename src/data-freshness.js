export const matrixRevisionStatements = [
  `CREATE TABLE IF NOT EXISTS matrix_revision (room_id TEXT PRIMARY KEY,revision INTEGER NOT NULL DEFAULT 0)`,
  ...['matrix_settings','matrix_template','matrix_point'].flatMap(table=>
    ['INSERT','UPDATE','DELETE'].map(operation=>`CREATE TRIGGER IF NOT EXISTS matrix_rev_${table}_${operation.toLowerCase()} AFTER ${operation} ON ${table} BEGIN INSERT INTO matrix_revision(room_id,revision) VALUES(${operation==='DELETE'?'OLD':'NEW'}.room_id,1) ON CONFLICT(room_id) DO UPDATE SET revision=revision+1; END`)
  )
];
// Freshness tokens are not credentials. Rotate this row as part of every data reset.
export const freshnessStatements = [
  `CREATE TABLE IF NOT EXISTS app_dataset (singleton INTEGER PRIMARY KEY CHECK(singleton=1),generation TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS deleted_character (character_id TEXT PRIMARY KEY,pl_id TEXT NOT NULL,character_name TEXT NOT NULL DEFAULT '',character_type TEXT NOT NULL DEFAULT 'PC',deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`
];
export async function datasetGeneration(db){
  const saved=await db.prepare('SELECT generation FROM app_dataset WHERE singleton=1').first();
  if(saved?.generation)return saved.generation;
  await db.prepare('INSERT OR IGNORE INTO app_dataset(singleton,generation) VALUES(1,?)').bind(crypto.randomUUID()).run();
  return (await db.prepare('SELECT generation FROM app_dataset WHERE singleton=1').first()).generation;
}
export async function checkDataset(request,db){
  if(['GET','HEAD','OPTIONS'].includes(request.method))return null;
  const generation=await datasetGeneration(db);
  if(request.headers.get('x-jijin-dataset')===generation)return null;
  return new Response(JSON.stringify({code:'DATASET_CHANGED',error:'保存データが更新されています。画面を再読み込みしてください。'}),{status:409,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}
