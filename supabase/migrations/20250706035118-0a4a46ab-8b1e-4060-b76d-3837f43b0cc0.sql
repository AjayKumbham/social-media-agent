
-- Phase 1: Critical Security Fixes

-- 1. Add missing RLS policies for llm_api_credentials table
ALTER TABLE public.llm_api_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own LLM API credentials" 
  ON public.llm_api_credentials 
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own LLM API credentials" 
  ON public.llm_api_credentials 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own LLM API credentials" 
  ON public.llm_api_credentials 
  FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own LLM API credentials" 
  ON public.llm_api_credentials 
  FOR DELETE 
  USING (auth.uid() = user_id);

-- 2. Add missing RLS policies for media_api_credentials table
ALTER TABLE public.media_api_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own media API credentials" 
  ON public.media_api_credentials 
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own media API credentials" 
  ON public.media_api_credentials 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own media API credentials" 
  ON public.media_api_credentials 
  FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own media API credentials" 
  ON public.media_api_credentials 
  FOR DELETE 
  USING (auth.uid() = user_id);

-- 3. Create security audit log table for monitoring
CREATE TABLE public.security_audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  event_type TEXT NOT NULL,
  event_details JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own audit logs" 
  ON public.security_audit_logs 
  FOR SELECT 
  USING (auth.uid() = user_id);

-- 4. Add indexes for security-related queries
CREATE INDEX idx_llm_api_credentials_user_id ON public.llm_api_credentials(user_id);
CREATE INDEX idx_media_api_credentials_user_id ON public.media_api_credentials(user_id);
CREATE INDEX idx_security_audit_logs_user_id ON public.security_audit_logs(user_id);
CREATE INDEX idx_security_audit_logs_created_at ON public.security_audit_logs(created_at DESC);
