const API_PATH = '/api/leaderboard';
const MAX_DISPLAY_NAME_LENGTH = 32;
const NAME_STORAGE_KEY = 'ggplotBattlesDisplayName';
const OWN_SUBMISSIONS_STORAGE_KEY_PREFIX = 'ggplotBattlesOwnLeaderboardSubmissions';

let challengeId;
let getCode;
let latestScore = null;
let latestScoredCode = '';
let scoreState = 'unscored';
let submittedLatestScore = false;
let latestSubmissionId = null;
let isSubmitting = false;

let form;
let nameInput;
let submitButton;
let refreshButton;
let statusMessage;
let scoreStateStatus;
let tableBody;

function initLeaderboard(options) {
  challengeId = options.challengeId;
  getCode = options.getCode;

  form = document.getElementById('leaderboard-form');
  nameInput = document.getElementById('leaderboard-name');
  submitButton = document.getElementById('leaderboard-submit');
  refreshButton = document.getElementById('leaderboard-refresh');
  statusMessage = document.getElementById('leaderboard-status');
  scoreStateStatus = document.getElementById('score-state-status');
  tableBody = document.getElementById('leaderboard-body');

  if (!form || !nameInput || !submitButton || !refreshButton || !tableBody) {
    return;
  }

  nameInput.value = localStorage.getItem(NAME_STORAGE_KEY) || '';
  nameInput.addEventListener('input', updateSubmitButton);
  form.addEventListener('submit', submitScore);
  refreshButton.addEventListener('click', loadLeaderboard);
  document.addEventListener('battle-score-updated', handleScoreUpdated);
  document.addEventListener('battle-score-stale', handleScoreStale);

  updateScoreStateStatus();
  updateSubmitButton();
  loadLeaderboard();
}

function handleScoreUpdated(event) {
  latestScore = Number(event.detail.score);
  latestScoredCode = String(event.detail.code || getCode?.() || '');
  const currentCode = String(getCode?.() || '');
  scoreState = Number.isFinite(latestScore) && latestScoredCode
    ? (currentCode === latestScoredCode ? 'scored' : 'stale')
    : 'unscored';
  submittedLatestScore = false;
  latestSubmissionId = null;
  updateScoreStateStatus();
  updateSubmitButton();
}

function handleScoreStale() {
  submittedLatestScore = false;
  latestSubmissionId = null;
  scoreState = Number.isFinite(latestScore) ? 'stale' : 'unscored';
  updateScoreStateStatus();
  updateSubmitButton();
}

async function loadLeaderboard() {
  if (!challengeId) return;

  setStatus('Loading leaderboard...');
  refreshButton.disabled = true;

  try {
    const response = await fetch(`${API_PATH}?challenge_id=${encodeURIComponent(challengeId)}`);
    const payload = await parseJsonResponse(response);

    if (!response.ok) {
      throw new Error(payload.error || 'Leaderboard unavailable');
    }

    renderLeaderboard(payload.submissions || []);
    setStatus('');
  } catch (err) {
    renderEmptyTable('No leaderboard yet.');
    setStatus(err.message);
  } finally {
    refreshButton.disabled = false;
  }
}

async function submitScore(event) {
  event.preventDefault();

  const displayName = normalizeDisplayName(nameInput.value);
  if (!isValidDisplayName(displayName)) {
    setStatus(`Use 2-${MAX_DISPLAY_NAME_LENGTH} characters for your name.`);
    updateSubmitButton();
    return;
  }

  if (!Number.isFinite(latestScore)) {
    setStatus('Run your code before submitting.');
    updateSubmitButton();
    return;
  }

  if (scoreState !== 'scored' || !latestScoredCode) {
    setStatus('Run & Compare the full script before submitting.');
    updateSubmitButton();
    return;
  }

  isSubmitting = true;
  updateSubmitButton();
  setStatus('Submitting score...');

  try {
    const response = await fetch(API_PATH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        challengeId,
        displayName,
        score: latestScore,
        code: latestScoredCode
      })
    });
    const payload = await parseJsonResponse(response);

    if (!response.ok) {
      throw new Error(payload.error || 'Could not submit score');
    }

    localStorage.setItem(NAME_STORAGE_KEY, displayName);
    nameInput.value = displayName;
    rememberOwnSubmission(payload.submission);
    submittedLatestScore = true;
    latestSubmissionId = payload.submission?.id || null;
    await loadLeaderboard();
    setStatus(payload.session_removal_supported === false
      ? 'Score submitted. Remove will be available after Supabase refreshes its REST schema cache.'
      : canRemoveOwnSubmission(payload.submission)
      ? 'Score submitted. You can remove it from this tab.'
      : 'Score submitted.');
  } catch (err) {
    setStatus(err.message);
  } finally {
    isSubmitting = false;
    updateSubmitButton();
  }
}

function renderLeaderboard(submissions) {
  if (submissions.length === 0) {
    renderEmptyTable('No scores yet.');
    return;
  }

  const rows = submissions.map((submission, index) => {
    const row = document.createElement('tr');

    appendCell(row, index + 1);
    appendCell(row, submission.display_name);
    appendCell(row, `${Number(submission.score).toFixed(2)}%`);
    appendDateCell(row, submission);

    return row;
  });

  tableBody.replaceChildren(...rows);
}

function renderEmptyTable(message) {
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.colSpan = 4;
  cell.textContent = message;
  row.appendChild(cell);
  tableBody.replaceChildren(row);
}

function appendCell(row, value) {
  const cell = document.createElement('td');
  cell.textContent = value;
  row.appendChild(cell);
}

function appendDateCell(row, submission) {
  const cell = document.createElement('td');
  cell.className = 'leaderboard-date-cell';

  const dateContent = document.createElement('span');
  dateContent.className = 'leaderboard-date-content';

  const dateText = document.createElement('span');
  dateText.textContent = formatDate(submission.submitted_at);
  dateContent.appendChild(dateText);

  const deleteToken = getOwnSubmissionDeleteToken(submission.id);
  if (deleteToken) {
    const button = document.createElement('button');
    button.className = 'leaderboard-remove-button';
    button.type = 'button';
    button.textContent = 'Remove';
    button.addEventListener('click', () => {
      deleteOwnSubmission(submission.id, deleteToken, button);
    });
    dateContent.appendChild(button);
  }

  cell.appendChild(dateContent);
  row.appendChild(cell);
}

async function deleteOwnSubmission(submissionId, deleteToken, button) {
  if (!challengeId || !submissionId || !deleteToken) return;

  button.disabled = true;
  setStatus('Removing score...');

  try {
    const response = await fetch(API_PATH, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        challengeId,
        submissionId,
        deleteToken
      })
    });
    const payload = await parseJsonResponse(response);

    if (!response.ok) {
      throw new Error(payload.error || 'Could not remove score');
    }

    forgetOwnSubmission(submissionId);
    if (submissionId === latestSubmissionId) {
      submittedLatestScore = false;
      latestSubmissionId = null;
    }

    await loadLeaderboard();
    setStatus('Score removed.');
  } catch (err) {
    button.disabled = false;
    setStatus(err.message);
  } finally {
    updateSubmitButton();
  }
}

function updateSubmitButton() {
  if (!submitButton || !nameInput) return;

  const displayName = normalizeDisplayName(nameInput.value);
  submitButton.disabled = isSubmitting
    || submittedLatestScore
    || scoreState !== 'scored'
    || !Number.isFinite(latestScore)
    || !latestScoredCode
    || !isValidDisplayName(displayName);
}

function updateScoreStateStatus() {
  if (!scoreStateStatus) return;

  const labels = {
    unscored: 'Score not ready',
    stale: 'Score needs update',
    scored: 'Ready to submit'
  };

  scoreStateStatus.textContent = labels[scoreState] || labels.unscored;
  scoreStateStatus.classList.toggle('is-unscored', scoreState === 'unscored');
  scoreStateStatus.classList.toggle('is-stale', scoreState === 'stale');
  scoreStateStatus.classList.toggle('is-scored', scoreState === 'scored');
}

function rememberOwnSubmission(submission) {
  const deleteToken = submission?.delete_token || submission?.deleteToken;
  if (!submission?.id || !deleteToken) return;

  const ownSubmissions = getOwnSubmissions();
  ownSubmissions[submission.id] = deleteToken;
  saveOwnSubmissions(ownSubmissions);
}

function canRemoveOwnSubmission(submission) {
  return Boolean(submission?.id && (submission.delete_token || submission.deleteToken));
}

function forgetOwnSubmission(submissionId) {
  const ownSubmissions = getOwnSubmissions();
  delete ownSubmissions[submissionId];
  saveOwnSubmissions(ownSubmissions);
}

function getOwnSubmissionDeleteToken(submissionId) {
  return getOwnSubmissions()[submissionId] || '';
}

function getOwnSubmissions() {
  try {
    const ownSubmissions = JSON.parse(sessionStorage.getItem(getOwnSubmissionsStorageKey()) || '{}');
    return ownSubmissions && typeof ownSubmissions === 'object' && !Array.isArray(ownSubmissions)
      ? ownSubmissions
      : {};
  } catch (err) {
    console.info('Unable to read removable leaderboard submissions:', err);
    return {};
  }
}

function saveOwnSubmissions(ownSubmissions) {
  try {
    sessionStorage.setItem(getOwnSubmissionsStorageKey(), JSON.stringify(ownSubmissions));
  } catch (err) {
    console.info('Unable to remember removable leaderboard submissions:', err);
  }
}

function getOwnSubmissionsStorageKey() {
  return `${OWN_SUBMISSIONS_STORAGE_KEY_PREFIX}:${challengeId}`;
}

function setStatus(message) {
  if (statusMessage) {
    statusMessage.textContent = message;
  }
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function normalizeDisplayName(value) {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isValidDisplayName(value) {
  const length = Array.from(value).length;
  return length >= 2 && length <= MAX_DISPLAY_NAME_LENGTH;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

window.initLeaderboard = initLeaderboard;
