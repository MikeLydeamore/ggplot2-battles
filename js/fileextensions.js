function getCurrentFolderName() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  // Return the second-to-last item if last is 'index.html'
  if (parts.length > 1 && parts[parts.length - 1].startsWith('index')) {
    return parts[parts.length - 2];
  }
  return parts[parts.length - 1]; // fallback
}
