using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;

namespace Umbraco.Community.UmbraDesktop.Multimedia.Media;

/// <summary>
/// The Multimedia package's one piece of server code: teaching the site to serve the audio types
/// Umbraco accepts and ASP.NET Core does not know (<see cref="AudioFileTypes"/>).
/// </summary>
/// <remarks>
/// A post-configuration, so it runs after the site's own <c>Configure&lt;StaticFileOptions&gt;</c>,
/// whichever order the composers and <c>Program.cs</c> ran in, and sees the provider the site settled
/// on. The static file middleware Umbraco adds reads these options, which is what serves
/// <c>/media</c>.
/// </remarks>
public sealed class MultimediaComposer : IComposer
{
    /// <inheritdoc />
    public void Compose(IUmbracoBuilder builder)
    {
        builder.Services.PostConfigure<StaticFileOptions>(AudioFileTypes.AddTo);
    }
}
