import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://wfpqesnttzarfdfsghzw.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmcHFlc250dHphcmZkZnNnaHp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NDc4MzUsImV4cCI6MjA5NjAyMzgzNX0.NHCxSmJpG0iGk-NAvoRhzjlsuSXuAanBqYad0DGWf7c'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
