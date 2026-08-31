PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS top_auth (
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_hash_version INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS top_session (
  session_token_hash TEXT PRIMARY KEY,
  session_expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_top_session_expires ON top_session(session_expires_at);

CREATE TABLE IF NOT EXISTS pl (
  pl_id TEXT PRIMARY KEY,
  access_token_hash TEXT NOT NULL,
  pl_name TEXT NOT NULL,
  pl_color TEXT NOT NULL DEFAULT '#ffe66b',
  pl_color_dark TEXT NOT NULL DEFAULT '#ffe66b',
  pl_icon_key TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS character (
  character_id TEXT PRIMARY KEY,
  pl_id TEXT NOT NULL,
  character_type TEXT NOT NULL DEFAULT 'PC' CHECK(character_type IN ('PC','NPC')),
  character_name TEXT NOT NULL,
  character_color TEXT NOT NULL DEFAULT '#ffe66b',
  character_color_dark TEXT NOT NULL DEFAULT '#ffe66b',
  character_icon_key TEXT NOT NULL DEFAULT '',
  matrix_icon_key TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(pl_id) REFERENCES pl(pl_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_character_pl ON character(pl_id, updated_at);

CREATE TABLE IF NOT EXISTS transfer (
  transfer_id TEXT PRIMARY KEY,
  pl_id TEXT NOT NULL,
  transfer_code_hash TEXT NOT NULL UNIQUE,
  transfer_expires_at TEXT NOT NULL,
  transfer_used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(pl_id) REFERENCES pl(pl_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_transfer_expiry ON transfer(transfer_expires_at);

CREATE TABLE IF NOT EXISTS room (
  room_id TEXT PRIMARY KEY,
  owner_pl_id TEXT NOT NULL,
  room_name TEXT NOT NULL,
  room_admin_token_hash TEXT NOT NULL,
  room_revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_room_owner ON room(owner_pl_id, updated_at);

CREATE TABLE IF NOT EXISTS room_theme (
  room_id TEXT PRIMARY KEY,
  base_color TEXT NOT NULL DEFAULT '#171a20',
  alternate_cells_enabled INTEGER NOT NULL DEFAULT 0,
  alternate_cell_color TEXT NOT NULL DEFAULT '#f7f7f8',
  gradient_start_color TEXT NOT NULL DEFAULT '#67a3ff',
  gradient_end_color TEXT NOT NULL DEFAULT '#9f71ff',
  group_row_color TEXT NOT NULL DEFAULT '#ffffff',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(room_id) REFERENCES room(room_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS room_participant (
  room_id TEXT NOT NULL,
  pl_id TEXT NOT NULL,
  character_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(room_id) REFERENCES room(room_id) ON DELETE CASCADE,
  FOREIGN KEY(pl_id) REFERENCES pl(pl_id) ON DELETE CASCADE,
  FOREIGN KEY(character_id) REFERENCES character(character_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_room_participant_unique ON room_participant(room_id, pl_id, COALESCE(character_id,''));
CREATE INDEX IF NOT EXISTS idx_room_participant_room ON room_participant(room_id, updated_at);

CREATE TABLE IF NOT EXISTS log (
  log_id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  log_name TEXT NOT NULL,
  scenario_title TEXT NOT NULL DEFAULT '',
  scenario_participants TEXT NOT NULL DEFAULT '',
  spoiler_enabled INTEGER NOT NULL DEFAULT 0,
  log_sort_order INTEGER NOT NULL DEFAULT 0,
  log_display_mode TEXT NOT NULL DEFAULT 'light' CHECK(log_display_mode IN ('light','dark')),
  original_html_key TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(room_id) REFERENCES room(room_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_log_room_order ON log(room_id, log_sort_order, created_at);

CREATE TABLE IF NOT EXISTS log_tab (
  tab_id TEXT PRIMARY KEY,
  log_id TEXT NOT NULL,
  tab_name TEXT NOT NULL,
  tab_sort_order INTEGER NOT NULL DEFAULT 0,
  tab_hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(log_id) REFERENCES log(log_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_log_tab_name ON log_tab(log_id, tab_name);
CREATE INDEX IF NOT EXISTS idx_log_tab_order ON log_tab(log_id, tab_sort_order, created_at);

CREATE TABLE IF NOT EXISTS log_chunk (
  chunk_id TEXT PRIMARY KEY,
  tab_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_r2_key TEXT NOT NULL,
  FOREIGN KEY(tab_id) REFERENCES log_tab(tab_id) ON DELETE CASCADE,
  UNIQUE(tab_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_log_chunk_tab ON log_chunk(tab_id, chunk_index);

CREATE TABLE IF NOT EXISTS matrix_settings (
  room_id TEXT PRIMARY KEY,
  matrix_settings TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(room_id) REFERENCES room(room_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matrix_template (
  template_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  template_name TEXT NOT NULL,
  template_image_key TEXT NOT NULL DEFAULT '',
  template_definition TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(room_id, template_id),
  FOREIGN KEY(room_id) REFERENCES room(room_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_matrix_template_room ON matrix_template(room_id, updated_at);

CREATE TABLE IF NOT EXISTS matrix_point (
  point_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  character_id TEXT,
  is_placed INTEGER NOT NULL DEFAULT 0,
  point_x REAL,
  point_y REAL,
  template_x REAL,
  template_y REAL,
  scale_base_width REAL,
  coordinate_version INTEGER NOT NULL DEFAULT 0,
  supplement_body TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(room_id, template_id, point_id),
  FOREIGN KEY(room_id) REFERENCES room(room_id) ON DELETE CASCADE,
  FOREIGN KEY(character_id) REFERENCES character(character_id) ON DELETE SET NULL,
  FOREIGN KEY(room_id, template_id) REFERENCES matrix_template(room_id, template_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_matrix_point_room_template ON matrix_point(room_id, template_id, updated_at);

CREATE TABLE IF NOT EXISTS spreadsheet (
  sheet_id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  sheet_name TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  column_count INTEGER NOT NULL DEFAULT 0,
  sheet_settings TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(room_id) REFERENCES room(room_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_spreadsheet_room ON spreadsheet(room_id, updated_at);

CREATE TABLE IF NOT EXISTS spreadsheet_cell (
  cell_id TEXT PRIMARY KEY,
  sheet_id TEXT NOT NULL,
  row_index INTEGER NOT NULL,
  column_index INTEGER NOT NULL,
  cell_value TEXT NOT NULL DEFAULT '',
  cell_type TEXT NOT NULL DEFAULT 'text',
  cell_style TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(sheet_id) REFERENCES spreadsheet(sheet_id) ON DELETE CASCADE,
  UNIQUE(sheet_id, row_index, column_index)
);
CREATE INDEX IF NOT EXISTS idx_spreadsheet_cell_sheet ON spreadsheet_cell(sheet_id, row_index, column_index);

CREATE TABLE IF NOT EXISTS comment (
  comment_id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  author_pl_id TEXT NOT NULL,
  author_character_id TEXT,
  comment_target_type TEXT NOT NULL CHECK(comment_target_type IN ('log_range','matrix_point','matrix_template','spreadsheet_cell')),
  comment_target_id TEXT NOT NULL,
  comment_body TEXT NOT NULL,
  comment_image_key TEXT,
  parent_comment_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(room_id) REFERENCES room(room_id) ON DELETE CASCADE,
  FOREIGN KEY(author_pl_id) REFERENCES pl(pl_id) ON DELETE CASCADE,
  FOREIGN KEY(author_character_id) REFERENCES character(character_id) ON DELETE SET NULL,
  FOREIGN KEY(parent_comment_id) REFERENCES comment(comment_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_comment_room_created ON comment(room_id, created_at, comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_target ON comment(comment_target_type, comment_target_id, created_at);

CREATE TABLE IF NOT EXISTS log_comment_range (
  comment_id TEXT PRIMARY KEY,
  start_line_id TEXT NOT NULL,
  start_character_offset INTEGER NOT NULL DEFAULT 0,
  end_line_id TEXT NOT NULL,
  end_character_offset INTEGER NOT NULL DEFAULT 0,
  selected_text TEXT NOT NULL DEFAULT '',
  marker_color TEXT NOT NULL DEFAULT 'yellow',
  FOREIGN KEY(comment_id) REFERENCES comment(comment_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS comment_reaction (
  comment_id TEXT NOT NULL,
  author_pl_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(comment_id, author_pl_id),
  FOREIGN KEY(comment_id) REFERENCES comment(comment_id) ON DELETE CASCADE,
  FOREIGN KEY(author_pl_id) REFERENCES pl(pl_id) ON DELETE CASCADE
);
