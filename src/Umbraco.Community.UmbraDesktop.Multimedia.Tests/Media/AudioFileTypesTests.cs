using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using NSubstitute;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Community.UmbraDesktop.Multimedia.Media;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Multimedia.Tests.Media;

/// <summary>
/// The audio file types a site serves once the Multimedia package is installed: the ones Umbraco's own
/// Audio media type accepts and ASP.NET Core does not know, so a recording added to the media library
/// can be played back from it.
/// </summary>
public class AudioFileTypesTests
{
    /// <summary>
    /// The options a site ends up with, after this package's composer has run.
    /// </summary>
    /// <param name="configure">What the site itself configures, before the package's addition.</param>
    /// <returns>The static file options the middleware would read.</returns>
    private static StaticFileOptions Compose(Action<StaticFileOptions>? configure = null)
    {
        var services = new ServiceCollection();
        services.AddOptions();
        if (configure is not null) services.Configure(configure);
        var builder = Substitute.For<IUmbracoBuilder>();
        builder.Services.Returns(services);

        new MultimediaComposer().Compose(builder);

        return services.BuildServiceProvider().GetRequiredService<IOptions<StaticFileOptions>>().Value;
    }

    /// <summary>
    /// Sound Recorder saves Chrome's recordings as <c>.weba</c>, which Umbraco files under Audio and
    /// ASP.NET Core answered with a 404: the item was created and could not be played. Found by adding
    /// a recording to a running site.
    /// </summary>
    [Theory]
    [InlineData(".weba", "audio/webm")]
    [InlineData(".opus", "audio/ogg")]
    [InlineData(".flac", "audio/flac")]
    public void Serves_the_audio_types_ASP_NET_Core_does_not_know(string extension, string type)
    {
        var provider = Assert.IsType<FileExtensionContentTypeProvider>(Compose().ContentTypeProvider);

        Assert.True(provider.TryGetContentType($"recording{extension}", out var served));
        Assert.Equal(type, served);
    }

    /// <summary>
    /// Everything ASP.NET Core already serves is served as before.
    /// </summary>
    [Fact]
    public void Keeps_the_types_already_known()
    {
        var provider = Compose().ContentTypeProvider;

        Assert.True(provider.TryGetContentType("song.mp3", out var mp3));
        Assert.Equal("audio/mpeg", mp3);
        Assert.True(provider.TryGetContentType("film.webm", out var webm));
        Assert.Equal("video/webm", webm);
    }

    /// <summary>
    /// A site that maps one of these itself keeps its own answer: the package only fills gaps.
    /// </summary>
    [Fact]
    public void Leaves_a_type_the_site_mapped_itself()
    {
        var options = Compose(options =>
        {
            var provider = new FileExtensionContentTypeProvider();
            provider.Mappings[".weba"] = "audio/x-site-choice";
            options.ContentTypeProvider = provider;
        });

        Assert.True(options.ContentTypeProvider.TryGetContentType("a.weba", out var served));
        Assert.Equal("audio/x-site-choice", served);
    }

    /// <summary>
    /// A site with a content type provider of its own kind has decided what it serves, and that is
    /// not this package's to change.
    /// </summary>
    [Fact]
    public void Leaves_a_site_provider_of_another_kind_alone()
    {
        var own = Substitute.For<IContentTypeProvider>();

        var options = Compose(options => options.ContentTypeProvider = own);

        Assert.Same(own, options.ContentTypeProvider);
    }
}
