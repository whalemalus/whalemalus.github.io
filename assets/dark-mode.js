// Dark Mode Toggle
(function() {
  const STORAGE_KEY = 'theme-preference';
  const DARK_CLASS = 'dark-mode';

  function getPreference() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function setPreference(theme) {
    localStorage.setItem(STORAGE_KEY, theme);
    apply(theme);
  }

  function apply(theme) {
    if (theme === 'dark') {
      document.body.classList.add(DARK_CLASS);
    } else {
      document.body.classList.remove(DARK_CLASS);
    }
    updateToggleIcon(theme);
  }

  function updateToggleIcon(theme) {
    const btn = document.getElementById('dark-mode-toggle');
    if (btn) {
      btn.textContent = theme === 'dark' ? '☀' : '☾';
      btn.setAttribute('aria-label', theme === 'dark' ? '切换为亮色模式' : '切换为暗色模式');
    }
  }

  // Apply immediately to prevent flash
  apply(getPreference());

  // Set up toggle button when DOM is ready
  document.addEventListener('DOMContentLoaded', function() {
    const btn = document.getElementById('dark-mode-toggle');
    if (btn) {
      updateToggleIcon(getPreference());
      btn.addEventListener('click', function() {
        const current = getPreference();
        setPreference(current === 'dark' ? 'light' : 'dark');
      });
    }
  });
})();
