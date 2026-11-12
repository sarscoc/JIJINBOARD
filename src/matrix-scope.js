import {parentRoomForLog} from './data-model.js';
// MATRIX belongs to the board. Legacy log-scoped URLs remain valid aliases.
export async function validMatrixScope(db,board,scope){
 if(!board||!scope)return false;
 if(scope===board)return !!await db.prepare('SELECT 1 FROM room WHERE room_id=?').bind(board).first();
 const log=await parentRoomForLog(db,scope);return !!log&&log.room_id===board;
}

export const matrixPieceSourceId=id=>String(id||'').replace(/::piece:[0-9a-f-]{36}$/i,'');
