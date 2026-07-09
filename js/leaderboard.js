const API_PATH = '/api/leaderboard';
const MAX_DISPLAY_NAME_LENGTH = 32;
const NAME_STORAGE_KEY = 'ggplotBattlesDisplayName';

let challengeId;
let getCode;
let latestScore = null;
let submittedLatestScore = false;
let isSubmitting = false;

let form;
let nameInput;
let submitButton;
let refreshButton;
let statusMessage;
let tableBody;

export function initLeaderboard(options) {
  challengeId = options.challengeId;
  getCode = options.getCode;

  form = document.getElementById('leaderboard-form');
  nameInput = document.getElementById('leaderboard-name');
  submitButton = document.getElementById('leaderboard-submit');
  refreshButton = document.getElementById('leaderboard-refresh');
  statusMessage = document.getElementById('leaderboard-status');
  tableBody = document.getElementById('leaderboard-body');

  if (!form || !nameInput || !submitButton || !refreshButton || !tableBody) {
    return;
  }

  nameInput.value = localStorage.getItem(NAME_STORAGE_KEY) || '';
  nameInput.addEventListener('input', updateSubmitButton);
  form.addEventListener('submit', submitScore);
  refreshButton.addEventListener('click', loadLeaderboard);
  document.addEventListener('battle-score-updated', handleScoreUpdated);

  updateSubmitButton();
  loadLeaderboard();
}

function handleScoreUpdated(event) {
  latestScore = Number(event.detail.score);
  submittedLatestScore = false;
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
        code: getCode()
      })
    });
    const payload = await parseJsonResponse(response);

    if (!response.ok) {
      throw new Error(payload.error || 'Could not submit score');
    }

    localStorage.setItem(NAME_STORAGE_KEY, displayName);
    nameInput.value = displayName;
    submittedLatestScore = true;
    await loadLeaderboard();
    setStatus('Score submitted.');
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
    appendCell(row, formatDate(submission.submitted_at));

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

function updateSubmitButton() {
  if (!submitButton || !nameInput) return;

  const displayName = normalizeDisplayName(nameInput.value);
  submitButton.disabled = isSubmitting
    || submittedLatestScore
    || !Number.isFinite(latestScore)
    || !isValidDisplayName(displayName);
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
