// Delete ALL Upstash boxes (test/broken) and clear the houston_boxes table so
// the app re-provisions fresh. Hackathon cleanup — destructive on purpose.
//   cd cloud && node --env-file=.env.local scripts/cleanup-boxes.mjs
import { Box } from "@upstash/box";

const boxes = await Box.list();
console.log(`found ${boxes.length} box(es)`);
for (const b of boxes) {
  const id = b.id ?? b._id ?? b;
  try {
    const box = await Box.get(id);
    await box.delete();
    console.log("deleted", id);
  } catch (e) {
    console.log("skip", id, e?.message ?? e);
  }
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const res = await fetch(`${URL}/rest/v1/houston_boxes?user_id=not.is.null`, {
  method: "DELETE",
  headers: { apikey: KEY, authorization: `Bearer ${KEY}`, Prefer: "return=minimal" },
});
console.log("clear houston_boxes:", res.status);
