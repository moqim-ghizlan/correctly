// Throwaway spike: reports which built-in AI APIs exist in this context.
// Shared by the page, the worker (importScripts) and the offscreen document.
async function probeBuiltInAi() {
  const result = {
    Proofreader: typeof Proofreader,
    LanguageModel: typeof LanguageModel,
  };
  try {
    if (typeof LanguageModel !== 'undefined')
      result.languageModelAvailability = await LanguageModel.availability();
    if (typeof Proofreader !== 'undefined')
      result.proofreaderAvailability = await Proofreader.availability({
        expectedInputLanguages: ['fr'],
      });
  } catch (error) {
    result.error = String(error);
  }
  return result;
}
