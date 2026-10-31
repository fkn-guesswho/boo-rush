// Shared leaderboard for Boo Rush. Stores scores in Upstash Redis (connected through Vercel).
const KEY = 'boorush:leaderboard';
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(command) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const data = await r.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

async function getTop() {
  const flat = await redis(['ZREVRANGE', KEY, '0', '4', 'WITHSCORES']);
  const list = [];
  for (let i = 0; i < flat.length; i += 2) {
    list.push({ name: String(flat[i]).split('::')[0], score: Number(flat[i + 1]) });
  }
  return list;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!URL_ || !TOKEN) {
    return res.status(500).json({ error: 'Database not connected yet' });
  }
  try {
    if (req.method === 'GET') {
      return res.status(200).json(await getTop());
    }
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      const name = String(body.name || 'anonymous ghost').replace(/[^\w \-.!?]/g, '').trim().slice(0, 14) || 'anonymous ghost';
      const score = Math.floor(Number(body.score));
      // A perfect 30s run is roughly 500 pts, so anything above 600 is fake
      if (!Number.isFinite(score) || score < 0 || score > 600) {
        return res.status(400).json({ error: 'Invalid score' });
      }
      const member = name + '::' + Date.now() + Math.random().toString(36).slice(2, 6);
      await redis(['ZADD', KEY, String(score), member]);
      await redis(['ZREMRANGEBYRANK', KEY, '0', '-51']); // keep only the top 50 stored
      return res.status(200).json(await getTop());
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: 'Something went wrong' });
  }
};
