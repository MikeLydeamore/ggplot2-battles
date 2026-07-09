const crypto = require('crypto');

const TABLE_NAME = 'leaderboard_submissions';
const MAX_DISPLAY_NAME_LENGTH = 32;
const MAX_CODE_LENGTH = 20000;
const DEFAULT_RATE_LIMIT_MAX = 5;
const DEFAULT_RATE_LIMIT_WINDOW_SECONDS = 10 * 60;

module.exports = async function leaderboardHandler(req, res) {
  setCommonHeaders(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    if (req.method === 'GET') {
      await handleGet(req, res);
      return;
    }

    if (req.method === 'POST') {
      await handlePost(req, res);
      return;
    }

    if (req.method === 'DELETE') {
      await handleDelete(req, res);
      return;
    }

    res.setHeader('Allow', 'GET, POST, DELETE, OPTIONS');
    sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const message = statusCode === 500 ? 'Leaderboard service error' : err.message;

    if (statusCode === 500) {
      console.error(err);
    }

    sendJson(res, statusCode, { error: message });
  }
};

async function handleGet(req, res) {
  const { searchParams } = getRequestUrl(req);
  const challengeId = validateChallengeId(searchParams.get('challenge_id') || searchParams.get('challengeId'));
  const limit = clamp(Number(searchParams.get('limit') || 20), 1, 50);
  const query = [
    'select=id,display_name,score,submitted_at',
    `challenge_id=eq.${encodeURIComponent(challengeId)}`,
    'order=score.desc,submitted_at.asc',
    `limit=${limit}`
  ].join('&');

  const submissions = await supabaseRequest(`${TABLE_NAME}?${query}`);
  sendJson(res, 200, {
    submissions: submissions.map(publicSubmission)
  });
}

async function handlePost(req, res) {
  const body = await readJsonBody(req);
  const challengeId = validateChallengeId(body.challengeId || body.challenge_id);
  const displayName = validateDisplayName(body.displayName || body.display_name);
  const score = validateScore(body.score);
  const code = validateCode(body.code);
  const ipHash = hashClientIp(getClientIp(req));
  const deleteToken = createDeleteToken();

  await enforceRateLimit(challengeId, ipHash);

  const submissionPayload = {
    challenge_id: challengeId,
    display_name: displayName,
    score,
    code,
    ip_hash: ipHash,
    user_agent: String(req.headers['user-agent'] || '').slice(0, 300)
  };
  let supportsSessionRemoval = true;
  let submission;

  try {
    [submission] = await insertSubmission({
      ...submissionPayload,
      delete_token_hash: hashDeleteToken(deleteToken)
    });
  } catch (err) {
    if (!isMissingDeleteTokenColumnError(err)) {
      throw err;
    }

    console.warn('Supabase schema cache cannot see delete_token_hash yet; submitting score without session removal.');
    supportsSessionRemoval = false;
    [submission] = await insertSubmission(submissionPayload);
  }

  sendJson(res, 201, {
    submission: {
      ...publicSubmission(submission),
      ...(supportsSessionRemoval ? { delete_token: deleteToken } : {})
    },
    session_removal_supported: supportsSessionRemoval
  });
}

async function insertSubmission(submissionPayload) {
  return supabaseRequest(TABLE_NAME, {
    method: 'POST',
    headers: {
      Prefer: 'return=representation'
    },
    body: JSON.stringify(submissionPayload)
  });
}

async function handleDelete(req, res) {
  const body = await readJsonBody(req);
  const challengeId = validateChallengeId(body.challengeId || body.challenge_id);
  const submissionId = validateSubmissionId(body.submissionId || body.submission_id || body.id);
  const deleteToken = validateDeleteToken(body.deleteToken || body.delete_token);
  const query = [
    `id=eq.${encodeURIComponent(submissionId)}`,
    `challenge_id=eq.${encodeURIComponent(challengeId)}`,
    `delete_token_hash=eq.${encodeURIComponent(hashDeleteToken(deleteToken))}`
  ].join('&');

  let deletedSubmissions;
  try {
    deletedSubmissions = await supabaseRequest(`${TABLE_NAME}?${query}`, {
      method: 'DELETE',
      headers: {
        Prefer: 'return=representation'
      }
    });
  } catch (err) {
    if (isMissingDeleteTokenColumnError(err)) {
      throw httpError(409, 'Remove is not available until Supabase refreshes the REST schema cache.');
    }

    throw err;
  }

  if (!deletedSubmissions.length) {
    throw httpError(404, 'Submission not found or cannot be removed from this session.');
  }

  sendJson(res, 200, {
    removed: true,
    submission: publicSubmission(deletedSubmissions[0])
  });
}

async function enforceRateLimit(challengeId, ipHash) {
  const maxSubmissions = getEnvNumber('LEADERBOARD_RATE_LIMIT_MAX', DEFAULT_RATE_LIMIT_MAX);
  const windowSeconds = getEnvNumber(
    'LEADERBOARD_RATE_LIMIT_WINDOW_SECONDS',
    DEFAULT_RATE_LIMIT_WINDOW_SECONDS
  );
  const cutoff = new Date(Date.now() - windowSeconds * 1000).toISOString();
  const query = [
    'select=id',
    `challenge_id=eq.${encodeURIComponent(challengeId)}`,
    `ip_hash=eq.${encodeURIComponent(ipHash)}`,
    `submitted_at=gte.${encodeURIComponent(cutoff)}`,
    `limit=${maxSubmissions}`
  ].join('&');
  const recentSubmissions = await supabaseRequest(`${TABLE_NAME}?${query}`);

  if (recentSubmissions.length >= maxSubmissions) {
    throw httpError(429, 'Too many submissions. Please try again later.');
  }
}

async function supabaseRequest(path, options = {}) {
  const { url, serviceKey } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const payload = parseJson(text);

  if (!response.ok) {
    const message = payload?.message || payload?.error || 'Supabase request failed';
    throw httpError(response.status, message, {
      supabaseCode: payload?.code,
      details: payload?.details,
      hint: payload?.hint
    });
  }

  return payload;
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

  if (!url || !serviceKey) {
    throw httpError(500, 'Missing Supabase configuration');
  }

  return { url, serviceKey };
}

async function readJsonBody(req) {
  try {
    if (req.body && typeof req.body === 'object') {
      return req.body;
    }

    if (typeof req.body === 'string') {
      return JSON.parse(req.body || '{}');
    }

    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw httpError(400, 'Invalid JSON body');
  }
}

function validateChallengeId(value) {
  const challengeId = String(value || '').trim();
  if (!/^[a-z0-9_-]{1,80}$/.test(challengeId)) {
    throw httpError(400, 'Invalid challenge id');
  }
  return challengeId;
}

function validateDisplayName(value) {
  const displayName = normalizeDisplayName(String(value || ''));
  const length = Array.from(displayName).length;

  if (length < 2 || length > MAX_DISPLAY_NAME_LENGTH) {
    throw httpError(400, `Display name must be 2-${MAX_DISPLAY_NAME_LENGTH} characters`);
  }

  return displayName;
}

function validateScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw httpError(400, 'Score must be between 0 and 100');
  }

  return Math.round(score * 100) / 100;
}

function validateCode(value) {
  const code = String(value || '');

  if (code.trim().length === 0) {
    throw httpError(400, 'Code is required');
  }

  if (code.length > MAX_CODE_LENGTH) {
    throw httpError(400, `Code must be ${MAX_CODE_LENGTH} characters or fewer`);
  }

  return code;
}

function validateSubmissionId(value) {
  const submissionId = String(value || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(submissionId)) {
    throw httpError(400, 'Invalid submission id');
  }
  return submissionId;
}

function validateDeleteToken(value) {
  const deleteToken = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(deleteToken)) {
    throw httpError(400, 'Invalid remove token');
  }
  return deleteToken;
}

function normalizeDisplayName(value) {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getClientIp(req) {
  const forwardedFor = String(req.headers['x-forwarded-for'] || '');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  return String(req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown');
}

function hashClientIp(ipAddress) {
  const salt = process.env.LEADERBOARD_RATE_LIMIT_SALT
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SECRET_KEY
    || '';
  return crypto
    .createHash('sha256')
    .update(`${salt}:${ipAddress}`)
    .digest('hex');
}

function createDeleteToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashDeleteToken(deleteToken) {
  const salt = process.env.LEADERBOARD_DELETE_TOKEN_SALT
    || process.env.LEADERBOARD_RATE_LIMIT_SALT
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SECRET_KEY
    || '';
  return crypto
    .createHash('sha256')
    .update(`${salt}:${deleteToken}`)
    .digest('hex');
}

function isMissingDeleteTokenColumnError(err) {
  const message = String(err.message || '');
  return (!err.supabaseCode || err.supabaseCode === 'PGRST204')
    && message.includes('delete_token_hash')
    && message.includes('schema cache');
}

function publicSubmission(submission) {
  return {
    id: submission.id,
    display_name: submission.display_name,
    score: Number(submission.score),
    submitted_at: submission.submitted_at
  };
}

function getRequestUrl(req) {
  const host = req.headers.host || 'localhost';
  return new URL(req.url, `https://${host}`);
}

function getEnvNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function parseJson(text) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function setCommonHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.LEADERBOARD_ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function httpError(statusCode, message, details = {}) {
  const err = new Error(message);
  err.statusCode = statusCode;
  Object.assign(err, details);
  return err;
}
