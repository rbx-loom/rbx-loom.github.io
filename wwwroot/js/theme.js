window.loomTheme = (() => {
    const storageKey = "loom-theme";

    function getPreferredTheme() {
        const savedTheme = localStorage.getItem(storageKey);

        if (savedTheme === "light" || savedTheme === "dark") {
            return savedTheme;
        }

        return window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
    }

    function apply(theme) {
        document.documentElement.dataset.theme = theme;
    }

    function initialize() {
        apply(getPreferredTheme());
    }

    function toggle() {
        const current =
            document.documentElement.dataset.theme ?? getPreferredTheme();

        const next = current === "dark" ? "light" : "dark";

        localStorage.setItem(storageKey, next);
        apply(next);

        if (window.loomPlayground?.setTheme) {
            window.loomPlayground.setTheme(next);
        }

        return next;
    }

    initialize();

    return {
        toggle,
        getCurrent: () => document.documentElement.dataset.theme
    };
})();