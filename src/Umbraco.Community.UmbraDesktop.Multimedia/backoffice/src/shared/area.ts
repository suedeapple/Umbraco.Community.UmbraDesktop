/**
 * The localisation area every multimedia app's words live under.
 *
 * One area for the package rather than one per app, the same as Accessories' and Entertainment's: an
 * area is a package's namespace in Umbraco's merged dictionary, and the apps inside it are told apart
 * by their key prefix (`player…`, `viewer…`, `recorder…`). In its own module so the three elements
 * and the manifest cannot spell it three different ways.
 */
export const AREA = 'umbraDesktopMultimedia';
