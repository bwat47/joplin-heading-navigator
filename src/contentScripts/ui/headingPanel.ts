import { EditorView } from '@codemirror/view';
import type { ContentScriptSettings, HeadingItem, PanelDimensions } from '../../types';
import { createPanelCss, PANEL_TOP_OFFSET_VAR } from '../theme/panelTheme';
import { CopyButtonController } from './copyButtonController';
import { fuzzyFilter, highlightMatch } from './fuzzyFilter';

const PANEL_STYLE_ID = 'heading-navigator-styles';
const INDENT_BASE_PX = 12;
const INDENT_PER_LEVEL_PX = 12;
const FILTER_DEBOUNCE_MS = 100;
const PREVIEW_DEBOUNCE_MS = 30;
const PANEL_RIGHT_GAP_PX = 8;

export type PanelCloseReason = 'escape' | 'blur';

export interface PanelCallbacks {
    onPreview: (heading: HeadingItem) => void;
    onSelect: (heading: HeadingItem) => void;
    onClose: (reason: PanelCloseReason) => void;
    onCopy: (heading: HeadingItem) => void;
    onPinChange: (pinned: boolean) => void;
    onRequestEditorFocus: () => void;
}

/**
 * Floating panel UI for heading navigation with filtering, keyboard navigation, and copy functionality.
 *
 * Manages a filterable list of document headings with:
 * - Real-time search filtering
 * - Keyboard navigation (arrow keys, tab, enter, escape)
 * - Mouse selection and hover interactions
 * - Incremental DOM rendering for performance
 * - Theme-aware styling derived from editor
 * - Copy-to-clipboard for individual headings
 *
 * @example
 * ```typescript
 * const panel = new HeadingPanel(editorView, {
 *   onPreview: (heading) => scrollToHeading(heading),
 *   onSelect: (heading) => { scrollToHeading(heading); panel.destroy(); },
 *   onClose: (reason) => { restoreState(); panel.destroy(); },
 *   onCopy: (heading) => copyHeadingLink(heading),
 *   onPinChange: (pinned) => { if (pinned) forgetRestoreState(); },
 *   onRequestEditorFocus: () => editorView.focus()
 * }, settings);
 *
 * panel.open(headings, currentHeadingId);
 * ```
 */
export class HeadingPanel {
    private readonly view: EditorView;

    private readonly container: HTMLDivElement;

    private readonly input: HTMLInputElement;

    private readonly pinButton: HTMLButtonElement | null;

    private readonly list: HTMLUListElement;

    private headings: HeadingItem[] = [];

    private filtered: HeadingItem[] = [];

    private selectedHeadingId: string | null = null;

    private initialSelectedHeadingId: string | null = null;

    private previousFilterText = '';

    private settings: ContentScriptSettings;

    private lastPreviewedId: string | null = null;

    private previewDebounceTimer: number | null = null;

    private filterDebounceTimer: number | null = null;

    private readonly onPreview: (heading: HeadingItem) => void;

    private readonly onSelect: (heading: HeadingItem) => void;

    private readonly onClose: (reason: PanelCloseReason) => void;

    private readonly onCopy: (heading: HeadingItem) => void;

    private readonly onPinChange: (pinned: boolean) => void;

    private readonly onRequestEditorFocus: () => void;

    private readonly handleInputListener: () => void;

    private readonly handleKeyDownListener: (event: KeyboardEvent) => void;

    private readonly handleListClickListener: (event: MouseEvent) => void;

    private readonly handlePinClickListener: () => void;

    private readonly handleDocumentMouseDownListener: (event: MouseEvent) => void;

    private readonly handleTouchStartListener: (e: TouchEvent) => void;

    private readonly handleTouchMoveListener: (e: TouchEvent) => void;

    private readonly handleTouchEndListener: (e: TouchEvent) => void;

    private readonly copyButtonController = new CopyButtonController();

    private scrollerObserver: ResizeObserver | null = null;

    private pinned = false;

    public constructor(
        view: EditorView,
        callbacks: PanelCallbacks,
        settings: ContentScriptSettings,
        private readonly isMobile = false
    ) {
        this.view = view;
        this.onPreview = callbacks.onPreview;
        this.onSelect = callbacks.onSelect;
        this.onClose = callbacks.onClose;
        this.onCopy = callbacks.onCopy;
        this.onPinChange = callbacks.onPinChange;
        this.onRequestEditorFocus = callbacks.onRequestEditorFocus;
        this.settings = settings;

        this.container = document.createElement('div');
        this.container.className = 'heading-navigator-panel';
        this.applyModeClasses();
        if (this.isMobile) {
            this.container.classList.add('is-mobile');
        }

        this.input = document.createElement('input');
        this.input.type = 'search';
        this.input.placeholder = 'Filter headings';
        this.input.className = 'heading-navigator-input';

        if (this.isMobile) {
            this.pinButton = null;
            this.container.appendChild(this.input);
        } else {
            const header = document.createElement('div');
            header.className = 'heading-navigator-header';
            header.appendChild(this.input);

            this.pinButton = this.createHeaderButton('heading-navigator-pin-button', 'Pin headings panel');
            this.pinButton.setAttribute('aria-pressed', 'false');
            this.pinButton.appendChild(this.createPinIcon());
            header.appendChild(this.pinButton);

            this.container.appendChild(header);
        }

        this.list = document.createElement('ul');
        this.list.className = 'heading-navigator-list';
        this.container.appendChild(this.list);

        this.handleInputListener = () => {
            this.scheduleFilterUpdate();
        };

        this.handleKeyDownListener = (event: KeyboardEvent) => {
            this.handleKeyDown(event);
        };

        this.handleListClickListener = (event: MouseEvent) => {
            this.handleListClick(event);
        };

        this.handlePinClickListener = () => {
            this.setPinned(!this.pinned);
            this.focusFilter();
        };

        this.handleDocumentMouseDownListener = (event: MouseEvent) => {
            const target = event.target as Node | null;
            if (target && !this.container.contains(target)) {
                if (this.pinned) {
                    this.resetFilter();
                } else {
                    this.onClose('blur');
                }
            }
        };

        // Initialize touch listeners
        this.handleTouchStartListener = (e: TouchEvent) => this.handleTouchStart(e);
        this.handleTouchMoveListener = (e: TouchEvent) => this.handleTouchMove(e);
        this.handleTouchEndListener = (e: TouchEvent) => this.handleTouchEnd(e);

        this.input.addEventListener('input', this.handleInputListener);
        this.input.addEventListener('keydown', this.handleKeyDownListener);
        this.list.addEventListener('click', this.handleListClickListener);
        this.pinButton?.addEventListener('click', this.handlePinClickListener);

        if (this.isMobile) {
            this.list.addEventListener('touchstart', this.handleTouchStartListener);
            this.list.addEventListener('touchmove', this.handleTouchMoveListener);
            this.list.addEventListener('touchend', this.handleTouchEndListener);
        }

        this.view.dom.ownerDocument!.addEventListener('mousedown', this.handleDocumentMouseDownListener, true);
    }

    private createHeaderButton(className: string, label: string): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `heading-navigator-header-button ${className}`;
        button.title = label;
        button.setAttribute('aria-label', label);
        return button;
    }

    private createPinIcon(): SVGElement {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');

        const pinPathData = [
            'M15 4.5l-4 4l-4 1.5l-1.5 1.5l7 7l1.5 -1.5l1.5 -4l4 -4',
            'M9 15l-4.5 4.5',
            'M14.5 4l5.5 5.5',
        ];
        for (const d of pinPathData) {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', d);
            svg.appendChild(path);
        }
        return svg;
    }

    private longPressTimer: number | null = null;
    private touchStartCoords: { x: number; y: number } | null = null;
    private isLongPressTriggered = false;

    private handleTouchStart(event: TouchEvent): void {
        const touch = event.touches[0];
        this.touchStartCoords = { x: touch.clientX, y: touch.clientY };
        this.isLongPressTriggered = false;

        const item = (event.target as HTMLElement).closest<HTMLLIElement>('.heading-navigator-item');
        if (!item) return;

        this.longPressTimer = window.setTimeout(() => {
            this.isLongPressTriggered = true;
            this.triggerMobileCopy(item);
        }, 600);
    }

    private handleTouchMove(event: TouchEvent): void {
        if (!this.touchStartCoords) return;

        const touch = event.touches[0];
        const moveX = Math.abs(touch.clientX - this.touchStartCoords.x);
        const moveY = Math.abs(touch.clientY - this.touchStartCoords.y);

        // Cancel if moved more than 10px (scrolling)
        if (moveX > 10 || moveY > 10) {
            this.cancelLongPress();
        }
    }

    private handleTouchEnd(event: TouchEvent): void {
        this.cancelLongPress();

        // Prevent click if long press triggered copy
        if (this.isLongPressTriggered) {
            event.preventDefault();
            event.stopPropagation();
        }
    }

    private cancelLongPress(): void {
        if (this.longPressTimer !== null) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
        this.touchStartCoords = null;
    }

    private triggerMobileCopy(item: HTMLLIElement): void {
        const headingId = item.dataset.headingId;
        if (!headingId) return;

        const heading = this.headings.find((h) => h.id === headingId);
        if (heading) {
            this.onCopy(heading);

            // Visual feedback
            item.classList.add('is-mobile-copied');
            setTimeout(() => item.classList.remove('is-mobile-copied'), 300);

            // Haptic feedback if available
            if (navigator.vibrate) {
                navigator.vibrate(50);
            }
        }
    }

    /**
     * Opens the panel and displays the provided headings.
     *
     * Mounts the panel to the DOM, clears any previous filter state, and focuses the search input.
     * The panel selects the heading matching `selectedId` if provided, otherwise selects the first heading.
     *
     * @param headings - Array of headings to display
     * @param selectedId - ID of the heading to initially select (null for first heading)
     * @param focusInput - Whether to focus the filter input (false when restoring a pinned
     *   panel at startup, so editor focus is not stolen)
     */
    public open(headings: HeadingItem[], selectedId: string | null, focusInput = true): void {
        this.mount();
        this.input.value = '';
        this.selectedHeadingId = selectedId;
        this.initialSelectedHeadingId = selectedId;
        this.previousFilterText = '';
        this.lastPreviewedId = null;
        this.setHeadings(headings, '', false); // Avoid triggering scroll on initial open
        if (focusInput) {
            requestAnimationFrame(() => {
                if (this.isOpen()) {
                    this.input.focus();
                }
            });
        }
    }

    /**
     * Updates the panel with new heading data while preserving UI state.
     *
     * Used when the document content changes while the panel is open. Preserves the current
     * filter text by default, and uses incremental rendering to update only changed headings.
     *
     * @param headings - Updated array of headings
     * @param selectedId - ID of the heading that should be selected (null to preserve current selection)
     * @param preserveFilter - Whether to keep the current filter text (default: true)
     */
    public updateHeadings(headings: HeadingItem[], selectedId: string | null, preserveFilter = true): void {
        const filterText = preserveFilter ? this.input.value : '';
        if (!preserveFilter) {
            this.input.value = '';
        }
        this.selectedHeadingId = selectedId ?? this.selectedHeadingId;
        this.setHeadings(headings, filterText, false);
    }

    /**
     * Updates only the active heading marker without filtering or reconciling the heading list.
     */
    public setActiveHeading(selectedId: string | null): void {
        if (this.selectedHeadingId === selectedId) {
            return;
        }

        const previousId = this.selectedHeadingId;
        this.selectedHeadingId = selectedId;
        this.findHeadingElement(previousId)?.classList.remove('is-selected');
        this.findHeadingElement(selectedId)?.classList.add('is-selected');
        this.scrollActiveItemIntoView();
        this.updatePreviewMarker();
    }

    /**
     * Changes whether the desktop panel remains visible while focus is outside it.
     */
    public setPinned(pinned: boolean): void {
        if (this.isMobile || this.pinned === pinned) {
            return;
        }

        this.pinned = pinned;
        this.container.classList.toggle('is-pinned', pinned);

        if (this.pinButton) {
            const label = pinned ? 'Unpin headings panel' : 'Pin headings panel';
            this.pinButton.title = label;
            this.pinButton.setAttribute('aria-label', label);
            this.pinButton.setAttribute('aria-pressed', String(pinned));
        }
        this.onPinChange(pinned);
    }

    public isPinned(): boolean {
        return this.pinned;
    }

    public focusFilter(): void {
        if (this.isOpen()) {
            this.input.focus();
        }
    }

    /**
     * Removes the panel from the DOM and cleans up event listeners and timers.
     *
     * Must be called when the panel is no longer needed to prevent memory leaks.
     * Safe to call multiple times.
     */
    public destroy(): void {
        this.input.removeEventListener('input', this.handleInputListener);
        this.input.removeEventListener('keydown', this.handleKeyDownListener);
        this.list.removeEventListener('click', this.handleListClickListener);
        this.pinButton?.removeEventListener('click', this.handlePinClickListener);

        if (this.isMobile) {
            this.list.removeEventListener('touchstart', this.handleTouchStartListener);
            this.list.removeEventListener('touchmove', this.handleTouchMoveListener);
            this.list.removeEventListener('touchend', this.handleTouchEndListener);
        }

        this.view.dom.ownerDocument!.removeEventListener('mousedown', this.handleDocumentMouseDownListener, true);
        if (this.previewDebounceTimer !== null) {
            clearTimeout(this.previewDebounceTimer);
            this.previewDebounceTimer = null;
        }
        if (this.filterDebounceTimer !== null) {
            clearTimeout(this.filterDebounceTimer);
            this.filterDebounceTimer = null;
        }
        if (this.scrollerObserver) {
            this.scrollerObserver.disconnect();
            this.scrollerObserver = null;
        }
        this.copyButtonController.destroy(this.list);
        if (this.container.parentElement) {
            this.container.parentElement.removeChild(this.container);
        }
    }

    /**
     * Checks whether the panel is currently mounted in the DOM.
     *
     * @returns true if the panel is visible, false otherwise
     */
    public isOpen(): boolean {
        return Boolean(this.container.parentElement);
    }

    /**
     * Applies editor-facing settings to the mounted panel.
     *
     * @param settings - New dimension and compact-mode configuration
     */
    public setSettings(settings: ContentScriptSettings): void {
        this.settings = settings;
        ensurePanelStyles(this.view, this.settings.dimensions);
        this.applyModeClasses();
        this.applyTopOffset();
    }

    private applyModeClasses(): void {
        const compactMode = this.settings.compactMode && !this.isMobile;
        this.container.classList.toggle('is-compact', compactMode);
        this.container.classList.toggle(
            'hide-compact-level-badges',
            compactMode && this.settings.hideCompactModeHeadingLevelBadges
        );
    }

    /**
     * Applies the configured top offset via an inline CSS custom property.
     *
     * Kept off the {@link createPanelCss} signature so changing the offset never invalidates the
     * dimension-keyed stylesheet cache. Harmless on mobile, where `.is-mobile` overrides `top`.
     */
    private applyTopOffset(): void {
        this.container.style.setProperty(PANEL_TOP_OFFSET_VAR, `${this.settings.topOffset}px`);
    }

    private mount(): void {
        ensurePanelStyles(this.view, this.settings.dimensions);

        if (!this.container.parentElement) {
            const scrollRoot = this.view.scrollDOM.parentElement;
            const fallbackRoot = this.view.dom.parentElement ?? this.view.dom;
            (scrollRoot ?? fallbackRoot).appendChild(this.container);

            this.applyTopOffset();

            if (this.isMobile) return;

            this.updateRightOffset();
            this.scrollerObserver = new ResizeObserver(() => this.updateRightOffset());
            this.scrollerObserver.observe(this.view.scrollDOM);
        }
    }

    private updateRightOffset(): void {
        const scrollDOM = this.view.scrollDOM;
        const scrollbarWidth = scrollDOM.offsetWidth - scrollDOM.clientWidth;
        this.container.style.right = `${scrollbarWidth + PANEL_RIGHT_GAP_PX}px`;
    }

    private setHeadings(headings: HeadingItem[], filterText = '', emitPreview = true): void {
        this.headings = headings;
        this.applyFilter(filterText);
        if (emitPreview) {
            this.notifyPreview();
        } else {
            this.updatePreviewMarker();
        }
    }

    private resetFilter(): void {
        if (this.filterDebounceTimer !== null) {
            clearTimeout(this.filterDebounceTimer);
            this.filterDebounceTimer = null;
        }

        if (!this.input.value && !this.previousFilterText) {
            return;
        }

        this.input.value = '';
        this.applyFilter('');
        this.updatePreviewMarker();
    }

    private applyFilter(filterText: string, restoreInitialWhenCleared = false): void {
        const normalized = filterText.trim().toLowerCase();
        const filterChanged = normalized !== this.previousFilterText;
        this.previousFilterText = normalized;

        this.filtered = fuzzyFilter(normalized, this.headings);

        if (this.filtered.length === 0) {
            this.selectedHeadingId = null;
        } else if (!normalized && restoreInitialWhenCleared) {
            // When filter is completely cleared by user input, restore the initial selection
            // If the initial selection is still valid, use it; otherwise use first heading
            const initialHeading = this.initialSelectedHeadingId
                ? this.filtered.find((h) => h.id === this.initialSelectedHeadingId)
                : null;
            this.selectedHeadingId = initialHeading ? initialHeading.id : this.filtered[0].id;
        } else if (normalized && filterChanged) {
            // When filter text changed, always select the first matching heading
            // This matches VS Code/Sublime Text behavior: as you type or backspace,
            // the selection follows the first match in document order
            this.selectedHeadingId = this.filtered[0].id;
        } else if (!this.selectedHeadingId || !this.filtered.find((h) => h.id === this.selectedHeadingId)) {
            // Otherwise this is a programmatic update (keyboard navigation) or a repeat of the
            // same filter text (debounce firing after arrow keys): preserve the current selection
            // unless it is no longer in the filtered list
            this.selectedHeadingId = this.filtered[0].id;
        }

        this.render();
    }

    private scheduleFilterUpdate(): void {
        if (this.filterDebounceTimer !== null) {
            clearTimeout(this.filterDebounceTimer);
        }

        this.filterDebounceTimer = window.setTimeout(() => {
            this.filterDebounceTimer = null;
            this.applyFilter(this.input.value, true);
            this.notifyPreview(true);
        }, FILTER_DEBOUNCE_MS);
    }

    /**
     * Immediately applies any pending filter update and cancels the debounce timer.
     *
     * Called before arrow key navigation to ensure the filtered list is up-to-date
     * before changing selection. This prevents arrow navigation from being overridden
     * when the debounce timer fires after the user has already navigated.
     */
    private flushPendingFilter(): void {
        if (this.filterDebounceTimer !== null) {
            clearTimeout(this.filterDebounceTimer);
            this.filterDebounceTimer = null;
            this.applyFilter(this.input.value);
        }
    }

    private notifyPreview(force = false): void {
        if (this.previewDebounceTimer !== null) {
            clearTimeout(this.previewDebounceTimer);
            this.previewDebounceTimer = null;
        }

        if (!this.selectedHeadingId) {
            this.lastPreviewedId = null;
            return;
        }

        if (!force && this.selectedHeadingId === this.lastPreviewedId) {
            return;
        }

        const heading = this.headings.find((item) => item.id === this.selectedHeadingId);
        if (!heading) {
            this.lastPreviewedId = null;
            return;
        }

        const targetId = heading.id;
        this.previewDebounceTimer = window.setTimeout(() => {
            this.previewDebounceTimer = null;

            if (this.selectedHeadingId !== targetId) {
                return;
            }

            const currentHeading = this.headings.find((item) => item.id === targetId);
            if (!currentHeading) {
                this.lastPreviewedId = null;
                return;
            }

            this.lastPreviewedId = currentHeading.id;
            this.onPreview(currentHeading);
        }, PREVIEW_DEBOUNCE_MS);
    }

    private updatePreviewMarker(): void {
        if (!this.selectedHeadingId) {
            this.lastPreviewedId = null;
            return;
        }

        const heading = this.headings.find((item) => item.id === this.selectedHeadingId);
        this.lastPreviewedId = heading?.id ?? null;
    }

    private handleKeyDown(event: KeyboardEvent): void {
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                this.flushPendingFilter();
                this.moveSelection(1);
                break;
            case 'Tab':
                event.preventDefault();
                this.flushPendingFilter();
                this.moveSelection(event.shiftKey ? -1 : 1);
                break;
            case 'ArrowUp':
                event.preventDefault();
                this.flushPendingFilter();
                this.moveSelection(-1);
                break;
            case 'Enter':
                event.preventDefault();
                this.confirmSelection();
                break;
            case 'Escape':
                event.preventDefault();
                if (this.pinned) {
                    this.resetFilter();
                    this.onRequestEditorFocus();
                } else {
                    this.onClose('escape');
                }
                break;
            default:
                break;
        }
    }

    private moveSelection(delta: number): void {
        if (!this.filtered.length) {
            this.selectedHeadingId = null;
            this.render();
            return;
        }

        const currentIndex = this.filtered.findIndex((heading) => heading.id === this.selectedHeadingId);
        // Wrap around list: adding filtered.length ensures negative deltas wrap correctly
        const nextIndex = currentIndex >= 0 ? (currentIndex + delta + this.filtered.length) % this.filtered.length : 0;
        this.selectedHeadingId = this.filtered[nextIndex].id;
        this.updateSelection();
        this.scrollActiveItemIntoView();
        this.notifyPreview();
    }

    private confirmSelection(): void {
        if (!this.selectedHeadingId) {
            return;
        }

        const heading = this.headings.find((item) => item.id === this.selectedHeadingId);
        if (heading) {
            if (this.pinned) {
                this.resetFilter();
            }
            this.onSelect(heading);
        }
    }

    private handleListClick(event: MouseEvent): void {
        const target = event.target as HTMLElement | null;

        // Handle copy button clicks via delegation
        const copyButton = target?.closest<HTMLButtonElement>('.heading-navigator-copy-button');
        if (copyButton) {
            event.stopPropagation();
            event.preventDefault();

            const itemElement = copyButton.closest<HTMLLIElement>('.heading-navigator-item');
            if (!itemElement) {
                return;
            }

            const headingId = itemElement.dataset.headingId;
            if (!headingId) {
                return;
            }

            const heading = this.headings.find((item) => item.id === headingId);
            if (heading) {
                this.onCopy(heading);
                this.copyButtonController.showCopyFeedback(copyButton);
                this.input.focus();
            }
            return;
        }

        // Handle item selection clicks
        const itemElement = target?.closest<HTMLLIElement>('.heading-navigator-item');
        if (!itemElement) {
            return;
        }

        // On mobile, if this click followed a long-press, ignore it to prevent navigation
        if (this.isMobile && this.isLongPressTriggered) {
            return;
        }

        const headingId = itemElement.dataset.headingId;
        if (!headingId) {
            return;
        }

        const heading = this.headings.find((item) => item.id === headingId);
        if (heading) {
            this.setActiveHeading(heading.id);
            this.confirmSelection();
        }
    }

    private render(): void {
        if (!this.filtered.length) {
            this.renderEmptyState();
            return;
        }

        this.reconcileItems();
        this.scrollActiveItemIntoView();
    }

    /**
     * Renders the empty state when no headings match the current filter.
     *
     * Clears the list and displays a "No headings found" message.
     */
    private renderEmptyState(): void {
        // Clean up all copy button timers before clearing
        this.copyButtonController.destroy(this.list);
        this.list.innerHTML = '';
        const empty = document.createElement('li');
        empty.className = 'heading-navigator-empty';
        empty.textContent = 'No headings found';
        this.list.appendChild(empty);
    }

    /**
     * Updates the DOM to match the filtered headings list.
     *
     * Uses keyed reconciliation to efficiently reuse existing DOM nodes.
     */
    private reconcileItems(): void {
        const existingItems = this.buildItemMap();
        this.removeStaleItems(existingItems);
        this.updateAndOrderItems(existingItems);
    }

    /**
     * Builds a map of existing heading items and removes empty state if present.
     *
     * @returns Map of heading IDs to their DOM elements
     */
    private buildItemMap(): Map<string, HTMLLIElement> {
        // Remove empty state node if it exists
        const emptyNode = this.list.querySelector('.heading-navigator-empty');
        if (emptyNode) {
            emptyNode.remove();
        }

        // Build a map of existing items
        const existingItems = new Map<string, HTMLLIElement>();
        this.list.querySelectorAll<HTMLLIElement>('.heading-navigator-item').forEach((item) => {
            const id = item.dataset.headingId;
            if (id) {
                existingItems.set(id, item);
            }
        });

        return existingItems;
    }

    /**
     * Removes items that are no longer in the filtered list.
     *
     * Cleans up copy button timers before removing items to prevent memory leaks.
     *
     * @param existingItems - Map of existing items that will be modified by removing stale entries
     */
    private removeStaleItems(existingItems: Map<string, HTMLLIElement>): void {
        const filteredIds = new Set(this.filtered.map((h) => h.id));
        existingItems.forEach((item, id) => {
            if (!filteredIds.has(id)) {
                // Clean up copy button timer before removing
                const copyButton = item.querySelector<HTMLButtonElement>('.heading-navigator-copy-button');
                if (copyButton) {
                    this.copyButtonController.clearButton(copyButton);
                }
                item.remove();
                existingItems.delete(id);
            }
        });
    }

    /**
     * Updates or creates items in correct order and updates selection state.
     *
     * For each filtered heading:
     * - Reuses existing DOM node if available, otherwise creates new one
     * - Updates content if changed
     * - Ensures correct DOM order
     * - Updates selection state
     *
     * @param existingItems - Map of existing items to reuse
     */
    private updateAndOrderItems(existingItems: Map<string, HTMLLIElement>): void {
        this.filtered.forEach((heading, index) => {
            let item = existingItems.get(heading.id);

            if (!item) {
                // Create new item
                item = this.createHeadingItem(heading);
                existingItems.set(heading.id, item);
            } else {
                // Update existing item if needed
                this.updateHeadingItem(item, heading);
            }

            // Ensure correct order
            const currentChild = this.list.children[index];
            if (currentChild !== item) {
                this.list.insertBefore(item, currentChild || null);
            }

            // Update selection state
            if (heading.id === this.selectedHeadingId) {
                item.classList.add('is-selected');
            } else {
                item.classList.remove('is-selected');
            }
        });
    }

    private createHeadingItem(heading: HeadingItem): HTMLLIElement {
        const item = document.createElement('li');
        item.className = 'heading-navigator-item';
        item.dataset.headingId = heading.id;
        item.style.paddingLeft = `${INDENT_BASE_PX + (heading.level - 1) * INDENT_PER_LEVEL_PX}px`;

        const level = document.createElement('span');
        level.className = 'heading-navigator-item-level';
        level.textContent = `H${heading.level} - line ${heading.line + 1}`;

        const text = document.createElement('span');
        text.className = 'heading-navigator-item-text';
        text.appendChild(highlightMatch(heading.text, this.previousFilterText));

        const levelBadge = document.createElement('span');
        levelBadge.className = 'heading-navigator-level-badge';
        levelBadge.textContent = `H${heading.level}`;

        const copyButton = this.copyButtonController.createCopyButton();

        item.appendChild(level);
        item.appendChild(text);
        item.appendChild(levelBadge);
        item.appendChild(copyButton);

        return item;
    }

    private updateHeadingItem(item: HTMLLIElement, heading: HeadingItem): void {
        // Update padding if level changed
        const newPadding = `${INDENT_BASE_PX + (heading.level - 1) * INDENT_PER_LEVEL_PX}px`;
        if (item.style.paddingLeft !== newPadding) {
            item.style.paddingLeft = newPadding;
        }

        // Update level text
        const levelSpan = item.querySelector('.heading-navigator-item-level');
        const newLevelText = `H${heading.level} - line ${heading.line + 1}`;
        if (levelSpan && levelSpan.textContent !== newLevelText) {
            levelSpan.textContent = newLevelText;
        }

        // Update compact mode right-side heading level badge text
        const levelBadge = item.querySelector('.heading-navigator-level-badge');
        const newBadgeText = `H${heading.level}`;
        if (levelBadge && levelBadge.textContent !== newBadgeText) {
            levelBadge.textContent = newBadgeText;
        }

        // Update heading text with highlighting
        // Always rebuild when filter is active since highlight positions may change
        const textSpan = item.querySelector('.heading-navigator-item-text');
        if (textSpan) {
            textSpan.textContent = '';
            textSpan.appendChild(highlightMatch(heading.text, this.previousFilterText));
        }
    }

    private updateSelection(): void {
        const items = this.list.querySelectorAll<HTMLLIElement>('.heading-navigator-item');
        items.forEach((item) => {
            if (item.dataset.headingId === this.selectedHeadingId) {
                item.classList.add('is-selected');
            } else {
                item.classList.remove('is-selected');
            }
        });
    }

    private findHeadingElement(headingId: string | null): HTMLLIElement | null {
        if (!headingId) {
            return null;
        }

        return this.list.querySelector<HTMLLIElement>(`.heading-navigator-item[data-heading-id="${headingId}"]`);
    }

    /**
     * Ensures the selected item is visible inside the scrolling container.
     *
     * Uses manual scroll positioning instead of scrollIntoView() to avoid:
     * - layout thrash during rapid selection changes
     * - accidental scrolling of ancestor containers
     *
     * This matches the strategy used by VS Code's list widgets and is
     * significantly smoother when filtering or holding arrow keys.
     */
    private scrollActiveItemIntoView(): void {
        const container = this.list;
        const activeItem = container.querySelector<HTMLLIElement>('.heading-navigator-item.is-selected');

        if (!activeItem) {
            return;
        }

        // Measure relative position using bounding rects to avoid offsetParent quirks
        const containerRect = container.getBoundingClientRect();
        const itemRect = activeItem.getBoundingClientRect();

        const itemTop = itemRect.top - containerRect.top + container.scrollTop;
        const itemBottom = itemRect.bottom - containerRect.top + container.scrollTop;

        // Visible boundaries
        const viewTop = container.scrollTop;
        const viewBottom = viewTop + container.clientHeight;

        // Scroll upward if above the visible area
        if (itemTop < viewTop) {
            container.scrollTop = itemTop;
            return;
        }

        // Scroll downward if below the visible area
        if (itemBottom > viewBottom) {
            container.scrollTop = itemBottom - container.clientHeight;
        }
    }
}

function ensurePanelStyles(view: EditorView, options: PanelDimensions): void {
    const doc = view.dom.ownerDocument!;
    // Cache key based only on dimensions since CSS variables handle theme changes automatically
    const signature = [options.width.toString(), options.maxHeightRatio.toFixed(4)].join('|');

    let style = doc.getElementById(PANEL_STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
        style = doc.createElement('style');
        style.id = PANEL_STYLE_ID;
        (doc.head ?? doc.body).appendChild(style);
    }

    if (style.getAttribute('data-dimensions-signature') === signature) {
        return;
    }

    style.setAttribute('data-dimensions-signature', signature);
    style.textContent = createPanelCss(options);
}
