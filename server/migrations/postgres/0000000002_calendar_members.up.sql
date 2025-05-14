CREATE TABLE IF NOT EXISTS calendar_members (
    event varchar NOT NULL references calendar_events(id) ON DELETE CASCADE,
    member varchar NOT NULL references users(id),
    accepted boolean NOT NULL DEFAULT false,
    interested boolean NOT NULL DEFAULT false
); 