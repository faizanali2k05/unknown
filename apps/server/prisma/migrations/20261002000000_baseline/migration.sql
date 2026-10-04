-- Baseline for the original Unknown schema, which was provisioned with
-- `prisma db push` before versioned migrations were introduced. Production
-- marks this migration as already applied; a fresh database runs it normally.

CREATE TYPE public."CallKind" AS ENUM ('audio', 'video');
CREATE TYPE public."ConversationType" AS ENUM ('direct', 'group');
CREATE TYPE public."MemberRole" AS ENUM ('member', 'admin');
CREATE TYPE public."MessageType" AS ENUM ('text', 'image', 'voice', 'file', 'system');

CREATE TABLE public.users (
  id uuid NOT NULL,
  username text NOT NULL,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  avatar_url text,
  status_text text,
  last_seen_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT users_pkey PRIMARY KEY (id)
);

CREATE TABLE public.refresh_tokens (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE public.conversations (
  id uuid NOT NULL,
  type public."ConversationType" NOT NULL,
  title text,
  avatar_url text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT conversations_pkey PRIMARY KEY (id),
  CONSTRAINT conversations_created_by_fkey FOREIGN KEY (created_by)
    REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE TABLE public.conversation_members (
  conversation_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role public."MemberRole" NOT NULL DEFAULT 'member',
  last_read_at timestamptz,
  joined_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT conversation_members_pkey PRIMARY KEY (conversation_id, user_id),
  CONSTRAINT conversation_members_conversation_id_fkey FOREIGN KEY (conversation_id)
    REFERENCES public.conversations(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT conversation_members_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE public.messages (
  id uuid NOT NULL,
  client_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  sender_id uuid,
  type public."MessageType" NOT NULL DEFAULT 'text',
  body text,
  media_url text,
  media_meta jsonb,
  reply_to_id uuid,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  edited_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT messages_pkey PRIMARY KEY (id),
  CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id)
    REFERENCES public.conversations(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id)
    REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT messages_reply_to_id_fkey FOREIGN KEY (reply_to_id)
    REFERENCES public.messages(id) ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE TABLE public.calls (
  id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  initiator_id uuid,
  kind public."CallKind" NOT NULL,
  room_name text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at timestamptz,
  end_reason text,
  CONSTRAINT calls_pkey PRIMARY KEY (id),
  CONSTRAINT calls_conversation_id_fkey FOREIGN KEY (conversation_id)
    REFERENCES public.conversations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT calls_initiator_id_fkey FOREIGN KEY (initiator_id)
    REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE TABLE public.devices (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  fcm_token text NOT NULL,
  platform text NOT NULL DEFAULT 'android',
  updated_at timestamptz NOT NULL,
  CONSTRAINT devices_pkey PRIMARY KEY (id),
  CONSTRAINT devices_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX refresh_tokens_user_id_idx ON public.refresh_tokens USING btree (user_id);
CREATE INDEX conversation_members_user_id_idx ON public.conversation_members USING btree (user_id);
CREATE UNIQUE INDEX messages_conversation_id_client_id_key
  ON public.messages USING btree (conversation_id, client_id);
CREATE INDEX messages_conversation_id_created_at_idx
  ON public.messages USING btree (conversation_id, created_at DESC);
CREATE INDEX calls_conversation_id_started_at_idx
  ON public.calls USING btree (conversation_id, started_at DESC);
CREATE UNIQUE INDEX devices_fcm_token_key ON public.devices USING btree (fcm_token);
CREATE INDEX devices_user_id_idx ON public.devices USING btree (user_id);
CREATE UNIQUE INDEX users_username_key ON public.users USING btree (username);
