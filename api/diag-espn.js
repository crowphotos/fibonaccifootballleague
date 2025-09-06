// api/diag-espn.js
import { withCors } from './cors.js';

async function handler(req, res) {
  const swid = process.env.ESPN_SWID || '';
  const s2 = process.env.ESPN_S2 || '';
  const hasSwid = !!swid;
  const hasS2 = !!s2;
  const swidLooksBraced = hasSwid && swid.startsWith('{') && swid.endsWith('}');
  res.status(200).json({
    ok: true,
    env: {
      has_ESPN_SWID: hasSwid,
      has_ESPN_S2: hasS2,
      swidLooksBraced
    }
  });
}

export default withCors(handler);

