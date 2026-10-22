-- ==============================================================================
-- AXION MIND PRODUCTION DATABASE SCHEMA (SUPABASE POSTGRESQL + ROW LEVEL SECURITY)
-- ==============================================================================

-- 1. PROFILES TABLE (Subscription Tier, Usage Limits & User Metadata)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    tier TEXT NOT NULL DEFAULT 'free', -- 'free' or 'pro'
    daily_quota INT NOT NULL DEFAULT 50,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS for Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" 
ON public.profiles FOR SELECT 
USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = id);

-- Auto-create profile trigger on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, tier)
    VALUES (NEW.id, NEW.email, 'free');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. CLOUD PERSONAS TABLE (Custom Cloned Expert Personas)
CREATE TABLE IF NOT EXISTS public.cloud_personas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    avatar_url TEXT,
    system_prompt TEXT NOT NULL,
    config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, slug)
);

ALTER TABLE public.cloud_personas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own personas and public personas" 
ON public.cloud_personas FOR SELECT 
USING (auth.uid() = user_id OR is_public = TRUE);

CREATE POLICY "Users can insert own personas" 
ON public.cloud_personas FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own personas" 
ON public.cloud_personas FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own personas" 
ON public.cloud_personas FOR DELETE 
USING (auth.uid() = user_id);

-- 3. KNOWLEDGE CARDS TABLE (Dual-RAG Frameworks & Deal Anecdotes)
CREATE TABLE IF NOT EXISTS public.knowledge_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    persona_id UUID NOT NULL REFERENCES public.cloud_personas(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    card_type TEXT NOT NULL, -- 'framework' or 'anecdote'
    title TEXT NOT NULL,
    payload_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.knowledge_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own knowledge cards" 
ON public.knowledge_cards FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own knowledge cards" 
ON public.knowledge_cards FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own knowledge cards" 
ON public.knowledge_cards FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own knowledge cards" 
ON public.knowledge_cards FOR DELETE 
USING (auth.uid() = user_id);

-- 4. CHAT CONVERSATIONS TABLE (Full Conversation Streams & Model Metrics)
CREATE TABLE IF NOT EXISTS public.chat_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    persona_slug TEXT NOT NULL,
    session_id TEXT NOT NULL,
    title TEXT,
    messages_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, session_id)
);

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own chats" 
ON public.chat_conversations FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own chats" 
ON public.chat_conversations FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own chats" 
ON public.chat_conversations FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own chats" 
ON public.chat_conversations FOR DELETE 
USING (auth.uid() = user_id);

-- Indexes for lightning fast sync querying
CREATE INDEX IF NOT EXISTS idx_personas_sync ON public.cloud_personas(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_cards_sync ON public.knowledge_cards(persona_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_chats_sync ON public.chat_conversations(user_id, updated_at);
