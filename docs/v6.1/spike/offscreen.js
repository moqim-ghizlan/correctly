chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.type !== 'probe-offscreen') return false;
  probeBuiltInAi().then(respond);
  return true;
});
