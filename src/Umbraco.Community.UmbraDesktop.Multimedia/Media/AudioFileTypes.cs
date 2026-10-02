using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.StaticFiles;

namespace Umbraco.Community.UmbraDesktop.Multimedia.Media;

/// <summary>
/// The audio file types Umbraco accepts into the media library and ASP.NET Core will not serve.
/// </summary>
/// <remarks>
/// <para>
/// Umbraco's own Audio media type accepts <c>.weba</c> and <c>.opus</c>, but ASP.NET Core's static file
/// middleware answers any extension it has no content type for with a 404, and it has none for
/// either. So a site will take such a file into its media library and then refuse to hand it to
/// anyone, the Media section included. Found by adding a Sound Recorder recording to a running site:
/// Chrome records WebM sound, saved as <c>.weba</c> so that Umbraco files it under Audio rather than
/// Video, and the item was created and could not be played.
/// </para>
/// <para>
/// This only fills the gaps. An extension the site already maps keeps the site's answer, and a site
/// that replaced the content type provider with one of its own kind has decided for itself what it
/// serves, so that provider is left untouched.
/// </para>
/// </remarks>
public static class AudioFileTypes
{
    /// <summary>
    /// Each missing extension and the type it is served as. <c>.flac</c> is not in Umbraco's Audio type
    /// but arrives as a File item, and Media Player plays it, so it is served too.
    /// </summary>
    public static IReadOnlyDictionary<string, string> Missing { get; } = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        [".weba"] = "audio/webm",
        [".opus"] = "audio/ogg",
        [".flac"] = "audio/flac",
    };

    /// <summary>
    /// Add the missing types to the site's static file options, where the options use ASP.NET Core's
    /// own content type provider.
    /// </summary>
    /// <remarks>
    /// A site that sets nothing has no provider in its options at all: the middleware makes a
    /// <see cref="FileExtensionContentTypeProvider"/> of its own when it finds none. So that is what is
    /// made here, which serves everything the middleware's own would, plus these.
    /// </remarks>
    /// <param name="options">The options the static file middleware reads.</param>
    public static void AddTo(StaticFileOptions options)
    {
        options.ContentTypeProvider ??= new FileExtensionContentTypeProvider();
        if (options.ContentTypeProvider is not FileExtensionContentTypeProvider provider) return;
        foreach (var (extension, type) in Missing) provider.Mappings.TryAdd(extension, type);
    }
}
