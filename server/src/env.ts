// Loads server/.env when present (Node 20.12+). On Railway, variables come from the dashboard.
try {
  process.loadEnvFile?.('.env')
} catch {
  /* no .env file: fine */
}
