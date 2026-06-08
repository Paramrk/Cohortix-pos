import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing environment variables in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testRpc() {
  console.log('Testing exec_sql RPC...');
  const { data, error } = await supabase.rpc('exec_sql', { sql: 'SELECT 1 as result' });
  if (error) {
    console.error('exec_sql RPC call failed:', error.message);
  } else {
    console.log('exec_sql RPC call succeeded! Result:', data);
  }
}

testRpc().catch(console.error);
