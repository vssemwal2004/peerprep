import ts from 'typescript';

// Compile only injected JavaScript function code, never a full-program submission.
// Existing malformed JavaScript stays malformed so the actual compiler reports it.
export function prepareJavaScriptFunctionSource(language, source) {
  const code = String(source ?? '');
  if (String(language).toLowerCase() !== 'javascript') return code;
  const result = ts.transpileModule(code, {
    fileName: 'submission.js', reportDiagnostics: true,
    compilerOptions: {allowJs: true, target: ts.ScriptTarget.ES2019,
      module: ts.ModuleKind.None, newLine: ts.NewLineKind.LineFeed,
      removeComments: false, sourceMap: false, inlineSourceMap: false},
  });
  if (result.diagnostics?.some(d => d.category === ts.DiagnosticCategory.Error)) return code;
  return result.outputText;
}
