-- Stable, non-sequential public identity and private contact relationships.
-- Existing users are assigned IDs in-place; no user/conversation data is deleted.

BEGIN;

ALTER TABLE users ADD COLUMN public_id varchar(16);

UPDATE users
SET public_id = 'KASSI-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
WHERE public_id IS NULL;

ALTER TABLE users ALTER COLUMN public_id SET NOT NULL;
CREATE UNIQUE INDEX users_public_id_key ON users(public_id);

-- Keep old API images able to register users during a rollback window. The
-- current API always supplies the ID explicitly; the trigger fills it only
-- for legacy writers that do not know this column.
CREATE OR REPLACE FUNCTION assign_user_public_id() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.public_id IS NULL THEN
    LOOP
      NEW.public_id := 'KASSI-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM users WHERE public_id = NEW.public_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER users_assign_public_id_before_insert
  BEFORE INSERT ON users FOR EACH ROW EXECUTE FUNCTION assign_user_public_id();

CREATE TYPE "FriendRequestStatus" AS ENUM ('pending', 'accepted', 'rejected', 'cancelled');

CREATE TABLE friend_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status "FriendRequestStatus" NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT friend_requests_no_self CHECK (sender_id <> receiver_id),
  CONSTRAINT friend_requests_pair_uniq UNIQUE (sender_id, receiver_id)
);
CREATE INDEX friend_requests_receiver_status_created_idx
  ON friend_requests(receiver_id, status, created_at DESC);
CREATE INDEX friend_requests_sender_status_created_idx
  ON friend_requests(sender_id, status, created_at DESC);

CREATE TABLE friendships (
  user_low_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_high_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT friendships_pair_pk PRIMARY KEY (user_low_id, user_high_id),
  CONSTRAINT friendships_sorted_pair CHECK (user_low_id < user_high_id)
);
CREATE INDEX friendships_user_high_idx ON friendships(user_high_id);

CREATE TABLE user_blocks (
  blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_blocks_pair_pk PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT user_blocks_no_self CHECK (blocker_id <> blocked_id)
);
CREATE INDEX user_blocks_blocked_idx ON user_blocks(blocked_id);

-- Make call state explicit; close legacy rows that could otherwise remain
-- indefinitely in a ringing state after a process restart.
CREATE TYPE "CallStatus" AS ENUM ('ringing', 'answered', 'rejected', 'missed', 'ended', 'failed');
ALTER TABLE calls ADD COLUMN status "CallStatus" NOT NULL DEFAULT 'ringing';
ALTER TABLE calls ADD COLUMN answered_at timestamptz;
UPDATE calls
SET status = CASE
  WHEN ended_at IS NULL THEN 'missed'::"CallStatus"
  WHEN end_reason = 'declined' THEN 'rejected'::"CallStatus"
  WHEN end_reason = 'failed' THEN 'failed'::"CallStatus"
  ELSE 'ended'::"CallStatus"
END,
ended_at = COALESCE(ended_at, started_at),
  end_reason = COALESCE(end_reason, 'missed');

CREATE TYPE "MeetingStatus" AS ENUM ('active', 'ended', 'expired');
CREATE TABLE meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_code varchar(24) NOT NULL UNIQUE,
  room_name text NOT NULL UNIQUE,
  created_by_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status "MeetingStatus" NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  ended_at timestamptz
);
CREATE INDEX meetings_status_expires_at_idx ON meetings(status, expires_at);

COMMIT;
