export { db, shareRefForSession, upsertCustomer } from "../src/lib/db";
import { linkBrowser } from "../src/lib/browsers";
export const linkBrowserForTest = (bid: string, cid: number) => linkBrowser(bid, cid, "test");
