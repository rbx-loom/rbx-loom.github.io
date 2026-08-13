using Loom.Config;
using Loom.Core.Diagnostics;
using Loom.Core.Pipeline;
using Loom.Core.Text;

namespace RbxLoom.Web.Services;

public sealed class LoomPlaygroundCompiler
{
    public PlaygroundCompilationResult Compile(string source)
    {
        ArgumentNullException.ThrowIfNull(source);

        try
        {
            var config = new LoomConfig
            {
                ProjectDirectory = string.Empty,

                // NoEmit skips generation itself, not just the write, so the playground would get a
                // type check and an empty output panel. Generation has to stay on; what the browser
                // can't afford is the write, and CompilationUnit.Compile(SourceFile) never does one.
                NoEmit = false,
                ProjectType = ProjectType.Game,
                Files = new FilesConfig { SourceDirectory = "src", OutputDirectory = "dist" }
            };

            var sourceFile = new SourceFile(
                absolutePath: Path.Combine("src", "playground.loom"),
                sourceText: source
            );

            var compilationUnit = new CompilationUnit(config, [sourceFile]);

            // the buffer is the whole unit, so the single-file overload loses nothing an import
            // could have brought in, and it skips the Emit that would write dist/playground.luau
            var compiledFile = compilationUnit.Compile(sourceFile);
            if (compiledFile == null)
            {
                return PlaygroundCompilationResult.Failure(
                    "The compiler gave up on this source without reporting why."
                );
            }

            var diagnostics = compiledFile.Diagnostics.Set
                .Select(ToPlaygroundDiagnostic)
                .OrderBy(diagnostic => diagnostic.StartLineNumber)
                .ThenBy(diagnostic => diagnostic.StartColumn)
                .ToArray();

            return new PlaygroundCompilationResult(
                Output: compiledFile.RenderedLuau,
                Diagnostics: diagnostics,
                CompilerFailure: null
            );
        }
        catch (Exception exception)
        {
            return PlaygroundCompilationResult.Failure($"{exception.GetType().Name}: {exception.Message}\n{exception.StackTrace}");
        }
    }

    private static PlaygroundDiagnostic ToPlaygroundDiagnostic(Diagnostic diagnostic)
    {
        return new PlaygroundDiagnostic(
            StartLineNumber: Math.Max(diagnostic.Span.Start.Line, 1),

            // Loom's Character is zero-based. Monaco columns are one-based.
            StartColumn: Math.Max(diagnostic.Span.Start.Character + 1, 1),
            EndLineNumber: Math.Max(diagnostic.Span.End.Line, 1),
            EndColumn: Math.Max(diagnostic.Span.End.Character + 1, 1),
            Message: diagnostic.Hint is null
                ? diagnostic.Message
                : $"{diagnostic.Message}\nHint: {diagnostic.Hint}",
            Code: diagnostic.Code,
            Severity: diagnostic.Severity switch
            {
                DiagnosticSeverity.Error => "error",
                DiagnosticSeverity.Warn => "warning",
                DiagnosticSeverity.Info => "info",
                _ => "hint"
            }
        );
    }
}

public sealed record PlaygroundCompilationResult(
    string Output,
    IReadOnlyList<PlaygroundDiagnostic> Diagnostics,
    string? CompilerFailure
)
{
    public static PlaygroundCompilationResult Failure(string message)
    {
        return new PlaygroundCompilationResult(
            Output: string.Empty,
            Diagnostics: [],
            CompilerFailure: message
        );
    }
}

public sealed record PlaygroundDiagnostic(
    int StartLineNumber,
    int StartColumn,
    int EndLineNumber,
    int EndColumn,
    string Message,
    string? Code,
    string Severity
);