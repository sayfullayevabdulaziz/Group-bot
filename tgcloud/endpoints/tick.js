// Target of the GitHub Actions cron: `npx tgcloud run endpoints/tick '{}'`.
// `input.at` (ISO timestamp) overrides "now" for testing, but only when there is no verified
// Mini App init data, i.e. when invoked through `tgcloud run`, never over HTTP.

import { tick } from '../lib/tick.js';

export default async function (input, ctx) {
  const at = !ctx?.initData && input?.at ? new Date(input.at) : new Date();
  if (Number.isNaN(at.getTime())) throw new Error(`invalid "at": ${input.at}`);
  return await tick(at);
}
