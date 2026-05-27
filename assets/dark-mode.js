// Dark Mode Toggle
(function() {
  var STORAGE_KEY = 'theme-preference';
  var DARK_CLASS = 'dark-mode';

  function getPreference() {
    var stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function setPreference(theme) {
    localStorage.setItem(STORAGE_KEY, theme);
    apply(theme);
  }

  function apply(theme) {
    // Use documentElement (<html>) since this runs in <head> before <body> exists
    var el = document.documentElement;
    if (theme === 'dark') {
      el.classList.add(DARK_CLASS);
    } else {
      el.classList.remove(DARK_CLASS);
    }
    updateToggleIcon(theme);
  }

  function updateToggleIcon(theme) {
    var btn = document.getElementById('dark-mode-toggle');
    if (btn) {
      btn.textContent = theme === 'dark' ? '☀' : '☾';
      btn.setAttribute('aria-label', theme === 'dark' ? '切换为亮色模式' : '切换为暗色模式');
    }
  }

  // Apply immediately (before DOMContentLoaded) to prevent flash
  apply(getPreference());

  // Set up toggle button when DOM is ready
  document.addEventListener('DOMContentLoaded', function() {
    var btn = document.getElementById('dark-mode-toggle');
    if (btn) {
      updateToggleIcon(getPreference());
      btn.addEventListener('click', function() {
        var current = getPreference();
        setPreference(current === 'dark' ? 'light' : 'dark');
      });
    }
  });
})();
