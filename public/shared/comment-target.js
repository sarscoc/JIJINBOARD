"use strict";
// This exact codec is used by the browser and Worker. Addresses are identifiers,
// not navigation URLs; display names and row positions must never be their keys.
(() => {
  if (globalThis.JijinCommentTarget) return;
  const invalid=message=>Object.assign(Error(message),{status:400});
  const SEP = '@@matrix-template@@';
  const id = value => {
    const text = String(value ?? '');
    if (!text || text.length > 500 || /[\u0000-\u001f]/.test(text) || text === '.' || text === '..') throw invalid('コメント対象のIDが不正です');
    return encodeURIComponent(text);
  };
  const root = board => `/boards/${id(board)}`;
  const offset = value => {
    const n = Number(value ?? 0);
    if (!Number.isSafeInteger(n) || n < 0) throw invalid('ログの範囲が不正です');
    return n;
  };
  const log = (board, logId, range) => {
    const scope = `${root(board)}/logs/${id(logId)}`;
    if (!range) return scope;
    const start = offset(range.startOffset), end = offset(range.endOffset);
    const endId = String(range.endMessageId || range.messageId);
    if (endId === String(range.messageId) && end < start) throw invalid('ログの範囲が不正です');
    return `${scope}/ranges/${id(range.messageId)}?start=${start}&end=${end}&endMessage=${id(endId)}`;
  };
  const matrix = (board, templateId, pointId) => {
    const scope = `${root(board)}/matrix`;
    if (templateId == null) return scope;
    const page = `${scope}/${id(templateId)}`;
    return pointId == null ? page : `${page}/points/${id(pointId)}`;
  };
  const cell = (board, cellId) => `${root(board)}/sheets/main${cellId == null ? '' : `/cells/${id(cellId)}`}`;
  function parse(address, board) {
    if (typeof address !== 'string' || address.length > 4000 || !address.startsWith('/') || address.startsWith('//') || address.includes('#')) throw invalid('コメント対象のアドレスが不正です');
    const [path, query = ''] = address.split('?');
    if (address.split('?').length > 2) throw invalid('コメント対象のアドレスが不正です');
    const parts = path.split('/').slice(1).map(decodeURIComponent);
    if (parts[0] !== 'boards' || !parts[1] || (board != null && parts[1] !== String(board))) throw invalid('別の自陣のコメント対象です');
    parts.forEach(id);
    const result = {boardId:parts[1]};
    if (parts[2] === 'logs' && (parts.length === 4 || (parts.length === 6 && parts[4] === 'ranges'))) {
      Object.assign(result, {kind:'log', logId:parts[3]});
      if (parts.length === 6) {
        const q = new URLSearchParams(query);
        if ([...q.keys()].some(k => !['start','end','endMessage'].includes(k)) || [...q.keys()].length !== new Set(q.keys()).size) throw invalid('ログの範囲が不正です');
        Object.assign(result, {messageId:parts[5], endMessageId:q.get('endMessage') || parts[5], startOffset:offset(q.get('start')), endOffset:offset(q.get('end'))});
        result.address = log(result.boardId, result.logId, result);
      } else result.address = log(result.boardId, result.logId);
    } else if (parts[2] === 'matrix' && [3,4,6].includes(parts.length) && (parts.length !== 6 || parts[4] === 'points') && !query) {
      Object.assign(result, {kind:'matrix', templateId:parts[3] || '', pointId:parts[5] || ''});
      result.address = matrix(result.boardId, parts[3], parts[5]);
    } else if (parts[2] === 'sheets' && parts[3] === 'main' && (parts.length === 4 || (parts.length === 6 && parts[4] === 'cells')) && !query) {
      Object.assign(result, {kind:'sheet', cellId:parts[5] || ''});
      result.address = cell(result.boardId, parts[5]);
    } else if (parts[2] === 'matrix-legacy' && parts.length === 5 && ['matrix_point','matrix_template'].includes(parts[3]) && !query) {
      Object.assign(result, {kind:'matrix', legacyType:parts[3], legacyId:parts[4], address:`${root(result.boardId)}/matrix-legacy/${id(parts[3])}/${id(parts[4])}`});
    } else throw invalid('コメント対象のアドレスが不正です');
    if (query && !result.messageId) throw invalid('コメント対象のアドレスが不正です');
    return result;
  }
  function fromStorage(board, row) {
    if (row.comment_target_type === 'log_range') return log(board, row.comment_target_id, {messageId:row.start_line_id, endMessageId:row.end_line_id, startOffset:row.start_character_offset, endOffset:row.end_character_offset});
    if (row.comment_target_type === 'spreadsheet_cell') return cell(board, row.comment_target_id);
    const raw = String(row.comment_target_id), at = raw.indexOf(SEP);
    // Legacy unscoped comments keep their own address; do not guess a page.
    return at < 0 ? `${root(board)}/matrix-legacy/${id(row.comment_target_type)}/${id(raw)}` : matrix(board, raw.slice(0, at), raw.slice(at + SEP.length));
  }
  function storage(target) {
    const t = typeof target === 'string' ? parse(target) : target;
    if (t.legacyType) return {type:t.legacyType, key:t.legacyId};
    if (t.kind === 'log' && t.messageId) return {type:'log_range', key:t.logId};
    if (t.kind === 'sheet' && t.cellId) return {type:'spreadsheet_cell', key:t.cellId};
    if (t.kind === 'matrix' && t.templateId && t.pointId) {
      if (t.templateId.includes(SEP) || t.pointId.includes(SEP)) throw invalid('コメント対象のIDが不正です');
      return {type:'matrix_template', key:`${t.templateId}${SEP}${t.pointId}`};
    }
    throw invalid('コメント先を指定してください');
  }
  globalThis.JijinCommentTarget = Object.freeze({root, log, matrix, cell, parse, storage, fromStorage});
})();
