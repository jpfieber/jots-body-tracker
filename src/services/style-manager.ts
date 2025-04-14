import type { Settings } from '../types';

export class StyleManager {
    private styleEl: HTMLStyleElement;

    constructor() {
        this.styleEl = document.head.createEl('style');
        this.styleEl.id = 'body-tracker-dynamic-styles';
    }

    updateStyles(settings: Settings) {
        const dynamicStyles = `
            /* Target all checkbox inputs with our prefix */
            input[data-task="${settings.stringPrefixLetter}"]:checked,
            li[data-task="${settings.stringPrefixLetter}"]>input:checked,
            li[data-task="${settings.stringPrefixLetter}"]>p>input:checked {
                --checkbox-marker-color: transparent;
                border: none;
                border-radius: 0;
                background-image: none;
                background-color: currentColor;
                pointer-events: none;
                -webkit-mask-size: var(--checkbox-icon);
                -webkit-mask-position: 50% 50%;
                color: black;
                margin-left: -48px;
                -webkit-mask-image: url("${settings.decoratedTaskSymbol}");
            }

            /* Style the dataview inline fields */
            body [data-task="${settings.stringPrefixLetter}"]>.dataview.inline-field>.dataview.inline-field-key::after {
                content: "=";
                color: black;
            }
        `;
        this.styleEl.textContent = dynamicStyles;
    }

    removeStyles() {
        this.styleEl.remove();
    }
}