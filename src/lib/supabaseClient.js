import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://rrqljyhfjoyancgfefcb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJycWxqeWhmam95YW5jZ2ZlZmNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwOTY0MDMsImV4cCI6MjA2OTY3MjQwM30.aWcGiDPyaQy6iK9umVy8feZowfV_1ea8143WEpLmcF0';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
