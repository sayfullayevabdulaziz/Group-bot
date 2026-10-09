// Returns the digest text without sending it. Used to verify the data pipeline with `tgcloud run`.

import { buildDigest } from '../lib/digest.js';
import { SLOTS, tashkentNow } from '../lib/time.js';

export default async function (input) {
  const slot = SLOTS.find((s) => s.id === input?.slot) ?? SLOTS[0];
  return { text: await buildDigest(slot, tashkentNow().day) };
}
