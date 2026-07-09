function getCurrentChallengeId() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts.length > 1 && parts[parts.length - 1].startsWith('index')) {
    return parts[parts.length - 2];
  }
  return parts[parts.length - 1] || '';
}

window.getCurrentChallengeId = getCurrentChallengeId;
