// The Supabase project that keeps devices in sync. Both values are public by design: the database itself
// only lets each signed-in person reach their own rows (supabase/schema.sql).
export const CLOUD = { url: 'https://rpuucdqopfgsiqtqodli.supabase.co', key: 'sb_publishable_sdSSDcbypNIuhK8gYZ13Hw_IYKkIKK9' };
// Public half of the key that signs reminder notifications (the private half is only in the cloud).
export const PUSH = 'BMX_6tF_2jGzd4C710RT9JcZqLn0YkopEiIKa4Tcyvqg-on14DcEIYufeKSAw018ZbL_WxgSWhH7kyLCo43xml0';
