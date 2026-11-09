import { installHandle } from './handle';
import { installKeyCommands } from './keys';
import { installRealtime } from './realtime';
import { installSelectionButton } from './selection';
import { installShortcutExpander, requestPageConfig } from './shortcuts';

// Registered on all sites only after the user enabled the Correctly handle,
// text shortcuts, keyboard shortcuts or the translate button (5.15) and
// granted the optional site access.
// The worker says which are on (and which shortcuts and keys are active).
installShortcutExpander(document);
void requestPageConfig().then((config) => {
  if (config.smartButton)
    installHandle(document, config.handleY, undefined, config.locale);
  installKeyCommands(document, config.keybindings);
  // V6.1: underline mistakes while typing (opt-in, API engine, not on skipped sites).
  if (
    config.realtime &&
    !config.realtimeDisabledSites.includes(location.hostname.toLowerCase())
  )
    installRealtime(document, {
      locale: config.locale,
      engine: config.realtimeEngine,
      timing: config.realtimeTiming,
      dictionary: config.dictionary,
      replaceKey: config.realtimeReplaceKey,
      replaceAllKey: config.realtimeReplaceAllKey,
    });
  // 5.15: the translate button on selected text (opt-in).
  if (config.selectionButton)
    installSelectionButton(document, {
      locale: config.locale,
      translation: config.translation,
    });
});
