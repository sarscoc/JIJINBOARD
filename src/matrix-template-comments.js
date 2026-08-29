const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

const safeBody = async request => {
  try { return await request.json(); } catch { return null; }
};

export async function handleMatrixTemplateComments(request, env, boardId, roomId, templateId, executionContext) {
  if (request.method !== "DELETE") return json({ error: "Method Not Allowed" }, 405);

  boardId = String(boardId || "").slice(0, 160);
  roomId = String(roomId || "").slice(0, 160);
  templateId = String(templateId || "").slice(0, 180);
  const body = await safeBody(request);
  const authorId = String(body?.authorId || "").slice(0, 100);

  if (!boardId || !roomId || !templateId || !authorId) {
    return json({ error: "テンプレ削除情報が足りません" }, 400);
  }

  const linked = await env.DB.prepare(
    "SELECT 1 AS ok FROM board_logs WHERE board_id=? AND room_id=?"
  ).bind(boardId, roomId).first();
  if (!linked) return json({ error: "この自陣にないログです" }, 404);

  const participant = await env.DB.prepare(
    "SELECT 1 AS ok FROM board_log_participants WHERE board_id=? AND room_id=? AND author_id=? LIMIT 1"
  ).bind(boardId, roomId, authorId).first();
  const owner = participant ? null : await env.DB.prepare(
    "SELECT 1 AS ok FROM boards WHERE id=? AND owner_id=? LIMIT 1"
  ).bind(boardId, authorId).first();
  if (!participant && !owner) {
    return json({ error: "このテンプレのコメントを削除する権限がありません" }, 403);
  }

  const targetPrefix = `${templateId}@@matrix-template@@`;
  const descendants = `
    WITH RECURSIVE d(id) AS (
      SELECT id
      FROM board_matrix_icon_comments
      WHERE board_id=? AND room_id=? AND instr(target_id,?)=1
      UNION
      SELECT c.id
      FROM board_matrix_icon_comments c
      JOIN d ON c.parent_id=d.id
      WHERE c.board_id=? AND c.room_id=?
    )`;

  const likesDelete = env.DB.prepare(`${descendants}
    DELETE FROM board_matrix_icon_comment_likes
    WHERE comment_id IN (SELECT id FROM d)
  `).bind(boardId, roomId, targetPrefix, boardId, roomId);

  const commentsDelete = env.DB.prepare(`${descendants}
    DELETE FROM board_matrix_icon_comments
    WHERE id IN (SELECT id FROM d)
  `).bind(boardId, roomId, targetPrefix, boardId, roomId);

  const [, deleted] = await env.DB.batch([likesDelete, commentsDelete]);

  if (env.ROOMS && executionContext?.waitUntil) {
    const hub = env.ROOMS.get(env.ROOMS.idFromName(roomId));
    executionContext.waitUntil(
      hub.fetch("https://room/notify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "matrix-template-comments-delete" })
      }).catch(() => {})
    );
  }

  return json({ ok: true, deleted: Number(deleted?.meta?.changes || 0) });
}
