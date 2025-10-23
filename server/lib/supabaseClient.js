const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client with environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// In test environment, use mock values if environment variables are not set
if (process.env.NODE_ENV === 'test') {
  const testUrl = supabaseUrl || 'https://test.supabase.co';
  const testServiceKey = supabaseServiceKey || 'test-service-role-key';
  
  // Create Supabase client with service role key for server operations (bypasses RLS)
  const supabase = createClient(testUrl, testServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  module.exports = supabase;
} else {
  // Production environment - require all environment variables
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing required Supabase environment variables: SUPABASE_URL and SUPABASE_ANON_KEY');
  }

  // Use service role key for server-side operations (bypasses RLS)
  const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  module.exports = supabase;
}