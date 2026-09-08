/**
 * Guards for values that reach a Discord embed.
 *
 * discord.js validates URLs when they are set and throws if one is malformed,
 * which takes the whole command down rather than degrading. Archived entrants
 * do carry bad data: four tracks have a page title where the link should be
 * ("Bingo Party: Lap Music - YouTube"), which crashed /tournament-track-history
 * as soon as anyone paged to one.
 *
 * So nothing untrusted is handed to a builder without coming through here.
 */

const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,20}$/;

/** The value if it is a usable http(s) URL, otherwise null. */
function SafeUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch (error) {
    return null;
  }
}

/**
 * A YouTube thumbnail for the given id, or the supplied fallback image when the
 * id is missing or does not look like one. Never returns something that would
 * make setThumbnail throw.
 */
function SafeThumbnail(videoId, fallback) {
  if (typeof videoId === "string" && YOUTUBE_ID.test(videoId.trim())) {
    return `https://i1.ytimg.com/vi/${videoId.trim()}/mqdefault.jpg`;
  }
  return SafeUrl(fallback);
}

/**
 * Markdown link text, falling back to the bare label when the target is not a
 * real URL -- a broken link should read as plain text, not break the message.
 */
function SafeLink(label, url) {
  const safe = SafeUrl(url);
  const text = String(label == null ? "" : label);
  return safe ? `[${text}](${safe})` : text;
}

// Same shapes normalizeDb.js recognises, so an id pulled out here matches what
// the importer would have stored.
const YOUTUBE_URL =
  /(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/;

/** The video id inside a YouTube URL, or null if there is not one. */
function ExtractYoutubeId(value) {
  const url = SafeUrl(value);
  if (!url) return null;
  const found = url.match(YOUTUBE_URL);
  return found ? found[1] : null;
}

if (typeof module !== "undefined") {
  module.exports = {
    SafeUrl,
    SafeThumbnail,
    SafeLink,
    ExtractYoutubeId,
  };
}
