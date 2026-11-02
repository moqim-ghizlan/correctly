// Throwaway spike worker: opens the report page and answers a probe.
importScripts('probe.js');

chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({ url: chrome.runtime.getURL('spike.html') });
});

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.type !== 'probe-worker') return false;
  probeBuiltInAi().then(respond);
  return true;
});
