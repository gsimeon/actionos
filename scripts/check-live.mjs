import { createClient } from "@supabase/supabase-js";

const url = "https://kyfcvolkxxtsbouuzdtm.supabase.co";
const key = "sb_publishable_jdM13-nMTPcKtVoqFZLVmg_DD2YOotC";

const supabase = createClient(url, key);

async function check() {
  console.log("=== Testing Supabase Connection to Live Project ===");
  console.log("Target URL:", url);
  
  const tables = [
    "organizations",
    "profiles",
    "customers",
    "assets",
    "policies",
    "renewals",
    "tools",
    "action_sessions",
    "action_steps",
    "action_ledger_events",
    "transactions",
    "documents",
    "notifications",
    "todos"
  ];

  for (const table of tables) {
    try {
      const { data, error, count } = await supabase.from(table).select("*", { count: "exact", head: true });
      if (error) {
        console.log(`❌ Table '${table}': ${error.message} (code: ${error.code})`);
      } else {
        console.log(`✅ Table '${table}': exists, count = ${count}`);
      }
    } catch (err) {
      console.log(`❌ Table '${table}' exception:`, err.message);
    }
  }
}

check();
