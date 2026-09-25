# Settings categories from other packages: `umbraDesktopSettingsCategory`

> A second public manifest type beside `umbraDesktopApp`, so a package that adds apps to the desktop
> can put its settings in the desktop's own settings panel. Host-only: nothing in this repository
> registers one. `docs/desktop-apps.md` §6.1 is the guide for package authors.

## 1. Why

The settings panel's categories are curated (`settings/categories/index.ts`), like the themes and
the app catalogue: a category is a folder and one entry in a list. That is right for the desktop's
own settings, and it cannot hold another package's, because the list would have to name a package
this repository does not know about.

A package that adds apps to the desktop and has settings for them has two poor choices without this:
a panel of its own, which the person has to find, or no settings at all. To the person using it, a
setting of an app on the desktop is a desktop setting, so it belongs in Desktop settings.

It came out of the Accessories add-on, which first used it for the folder new Notepad and Paint
files are saved into. That package moved to asking where on the first save, as Save As does, and no
longer needs it; the extension point was kept, and split into its own pull request, as public API
for other packages (decided with the repository owner, 2026-09-25).

## 2. The contract

```ts
{
  type: 'umbraDesktopSettingsCategory',
  alias: 'My.Tools.Settings',
  name: 'My tools settings',
  element: () => import('./my-tools-settings.element.js'),
  weight: 100,
  meta: { label: '#myTools_settings', description: '#myTools_settingsAbout', icon: 'icon-settings' },
}
```

- **The host owns the row, the heading and the navigation; the package owns the element** and
  everything in it, including where its values are stored. The host reads none of them, as it reads
  no curated category's values either.
- **Modelled on `umbraDesktopApp`.** `label` and `description` go through `localize.string`, so a
  `#token` from the package's own dictionary and a literal both work. `element` is resolved with
  Umbraco's `createExtensionElement`, so every form an element takes elsewhere works.
- **Conditions are honoured**, through the same `UmbExtensionsManifestInitializer` the registered
  apps use: a category whose conditions are unmet has no row.
- **Placement is fixed; order within it is the package's.** Registered categories sit together
  after the desktop's personal categories (after Taskbar) and before Connections and Site, which are
  about other servers and every other user. `weight` orders them among themselves, higher first as
  everywhere in Umbraco, and never moves one past a curated category.
- **Deep links work.** Passing a registered alias as the settings modal's `category` opens the panel
  at it, including when the registration arrives after the panel opened.
- **A category that fails to load says so** (`settingsCategoryLoadFailed`) under its own heading,
  rather than leaving a blank screen.

## 3. The alternative

A category built into the host for each known add-on. It would ship a row that does nothing without
its package, couple the host to the package's storage, and still not help a package this repository
has never heard of.

## 4. Testing

`settings-modal.test.ts` registers fake categories through an injected registry and covers the row,
its placement after Taskbar, ordering by weight, conditions, the deep link and a failed load. Since
nothing in this repository registers a category, those tests are what keep the extension point
working; a change to the panel that breaks them breaks every package that uses it.
