-- Event attendees junction — events.id yra UUID, o `likes.entity_id` yra
-- BIGINT, todėl event "Eis"/attendee duomenų negalim laikyti tojoj pačioj
-- likes lentelėj (kaip darom su comment/news/track likes). Sukuriam dedicated
-- event_attendees lentelę su UUID FK į events.

CREATE TABLE IF NOT EXISTS public.event_attendees (
    id BIGSERIAL PRIMARY KEY,
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    user_username TEXT NOT NULL,
    user_rank TEXT,
    user_avatar_url TEXT,
    source TEXT NOT NULL DEFAULT 'modern',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (event_id, user_username)
);

CREATE INDEX IF NOT EXISTS idx_event_attendees_event
  ON public.event_attendees (event_id);
CREATE INDEX IF NOT EXISTS idx_event_attendees_user
  ON public.event_attendees (user_username);
