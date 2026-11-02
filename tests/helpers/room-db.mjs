import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
export function roomFixture(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(readFileSync(new URL('../../schema.sql',import.meta.url),'utf8'));
 const DB={queryCount:0,prepare(sql){let args=[];return {bind(...values){args=values;return this},first(){DB.queryCount++;return db.prepare(sql).get(...args)||null},all(){DB.queryCount++;return {results:db.prepare(sql).all(...args)}},run(){DB.queryCount++;return {meta:db.prepare(sql).run(...args)}},execute(){return /^\s*(SELECT|PRAGMA)/i.test(sql)?this.all():this.run()}}},async batch(items){db.exec('BEGIN');try{const out=items.map(x=>x.execute());db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}}};
 const objects=new Map();const LOGS={async head(k){return objects.get(k)},async put(k,body,metadata){objects.set(k,{body,...metadata})},async get(k){return objects.get(k)||null},async list({prefix='',limit=1000}={}){const keys=[...objects.keys()].filter(x=>x.startsWith(prefix));return {objects:keys.slice(0,limit).map(key=>({key})),truncated:keys.length>limit}},async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])objects.delete(key)}};
 db.exec("INSERT INTO room(room_id,owner_pl_id,room_name,room_admin_token_hash) VALUES('one','owner','ONE','unused'),('two','owner','TWO','unused');INSERT INTO log(log_id,room_id,log_name) VALUES('log-one','one','Log one'),('log-two','two','Log two')");
 return {db,objects,env:{DB,LOGS},DB};
}
