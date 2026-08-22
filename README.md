> [!note]
> This plugin was created entirely with AI tools.

# Heading Navigator

A Joplin plugin that provides a simple overlay panel allowing you to navigate and filter headings in the markdown editor, inspired by sublime text's "go to symbol" function.

![heading-navigator-demo](https://github.com/bwat47/joplin-heading-navigator/blob/main/images/heading_navigator_example_desktop.gif)

&nbsp;

<img src="https://github.com/user-attachments/assets/b6dc9106-8b61-4d51-92d6-c8bc6357b9e1" alt="mobile_example" width="200" height="445" />

&nbsp;

> [!important]
> This plugin only works in the markdown editor (editor view or split view). It does not work in the reading view or in the rich text editor. Codemirror 6 only, legacy editor is not supported.

## How to use

In the markdown editor, click the Heading Navigator toolbar button, or use the assigned keyboard shortcut.

There isn't a default keyboard shortcut, you can assign one under Tools | Options | Keyboard Shortcuts | "Go to Heading" command.

You can navigate through headings using tab key (goes to next heading), shift tab key (goes to previous heading), arrow keys, or by scrolling and selecting a heading.

You can filter the list of headings using the search filter at the top of the panel.

When selecting a heading with the keyboard, the editor will immediately scroll to the selected heading. Hitting enter in the panel (or clicking somewhere else) will close the panel. Hitting escape will close the panel & return to your original scroll/cursor position.

> [!note]
> When the panel is pinned, clicking outside of the panel will not close the panel, and hitting escape will move focus to the editor without closing the panel or restoring previous scroll position.

### Features

- Navigate through headings with the keyboard
- Search filter to filter list of headings
- Copy link to heading
- Panel adapts to your Joplin theme
- Adjustable panel size (desktop only)
- Ability to pin panel so it stays open until you unpin it (desktop only)

### Settings

The plugin can be customized via Tools | Options | Heading Navigator:

- **Panel width**: 240-640px (default: 320px)
    - Useful for longer heading text or smaller screens
- **Panel max height**: 40-90% of editor viewport (default: 75%)
    - Prevents the panel from obscuring too much content
- **Panel top offset**: 0-200px distance from the top of the editor (default: 12px)
    - Push the panel down to avoid overlapping other top-right editor decorations, such as a backlinks indicator (desktop only)
- **Compact mode**: Hide `H# - line #` metadata and reduce heading row height (default: off), with an option to hide the remaining heading level badges
    - Shows more headings at once in the panel (desktop only)
- **Copy internal anchor links**: Copy `[Heading](#heading-anchor)` instead of `[Heading @ Note](:/noteId#heading-anchor)` (default: off)

Panel appearance settings take effect the next time the panel is opened. The copy link setting applies to the next copied link.

### Mobile Support

- The plugin can be accessed via the toolbar icon in the editing toolbar in the markdown editor.

- On mobile, the panel has a responsive design and appears centered with faded background.

- On mobile, the copy link icon is hidden, and instead long-press on a heading will copy link.
