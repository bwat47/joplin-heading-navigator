> [!important]
> My coding knowledge is currently very limited. This plugin was created entirely with AI tools, and I may be limited in my ability to fix any issues.

# Heading Navigator

A Joplin plugin that provides a simple overlay panel allowing you to navigate and filter headings in the markdown editor, inspired by sublime text's "go to symbol" function.

![heading-navigator-demo](https://github.com/user-attachments/assets/5b2e2772-877b-4779-b53d-fd404566362e)

> [!important]
> This plugin only works in the markdown editor (editor view or split view). It does not work in the reading view or in the rich text editor. Codemirror 6 only, legacy editor is not supported.

## How to use

In the markdown editor, click the Heading Navigator toolbar button, or use the assigned keyboard shortcut.

> [!note]
> There isn't a default keyboard shortcut, you can assign one under Tools | Options | Keyboard Shortcuts | "Go to Heading" command.

You can navigate through headings using tab key (goes to next heading), shift tab key (goes to previous heading), arrow keys, or by scrolling and selecting a heading.

When selecting a heading with the keyboard, the editor will immediately scroll to the selected heading. Hitting enter in the dialogue (or clicking somewhere else) will close the dialogue. Hitting escape will close the dialogue & return to your original scroll/cursor position.

You can filter the list of headings using the search filter at the top of the panel.

### Features

- Navigate through headings with the keyboard
- Search filter to filter list of headings
- Panel adapts to your Joplin theme
- Adjustable panel size

### Settings

The panel appearance can be customized via Settings | Heading Navigator:

- **Panel width**: 240-640px (default: 320px)
    - Useful for longer heading text or smaller screens
- **Panel max height**: 40-90% of editor viewport (default: 75%)
    - Prevents the panel from obscuring too much content

Settings take effect the next time the panel is opened.
